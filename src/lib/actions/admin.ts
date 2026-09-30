"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAdmin } from "@/lib/admin";
import { getAuthedUser } from "@/lib/data/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { log } from "@/lib/log";
import { logConnection } from "@/lib/connection-log";
import {
  isValidServerAddress,
  isAcceptableServer,
  candidateAddresses,
  normaliseDomain,
} from "@/lib/mt5-brokers";
import { reachable } from "@/lib/mt5-reachable";

export type AdminActionResult = { ok?: true; pending?: string; error?: string };

async function guard(): Promise<{ error: string } | { adminId: string }> {
  const user = await getAuthedUser();
  if (!user || !(await isAdmin())) return { error: "Not allowed." };
  return { adminId: user.id };
}

/** Shut the hosted terminal down. The pool agent acts on this within ~15s. */
export async function adminDisableCloudEaAction(accountId: string): Promise<AdminActionResult> {
  const g = await guard();
  if ("error" in g) return g;

  const supabase = createServiceClient();
  const { data: inst, error } = await supabase
    .from("mt5_instances")
    .update({ desired_state: "removed", updated_at: new Date().toISOString() })
    .eq("account_id", accountId)
    .select("user_id")
    .maybeSingle();
  if (error) {
    log.error("admin disable cloud ea failed", { detail: error.message, accountId });
    return { error: "Could not stop the cloud terminal." };
  }
  if (inst) await logConnection(accountId, inst.user_id, "stopped_by_support", "info", "Support turned off your cloud terminal.");
  log.warn("admin stopped a cloud terminal", { detail: `admin=${g.adminId} account=${accountId}` });
  revalidatePath("/admin/users");
  revalidatePath("/admin/instances");
  return { ok: true };
}

/** Revoke every live EA key for a user: their terminals stop being accepted. */
export async function adminRevokeKeysAction(userId: string): Promise<AdminActionResult> {
  const g = await guard();
  if ("error" in g) return g;

  const { error } = await createServiceClient()
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (error) {
    log.error("admin revoke keys failed", { detail: error.message, userId });
    return { error: "Could not revoke the keys." };
  }
  log.warn("admin revoked EA keys", { detail: `admin=${g.adminId} user=${userId}` });
  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * Delete a user and everything they own.
 *
 * Order matters and is the whole reason this is not one statement. Every table
 * cascades from auth.users, including mt5_instances -- the row the pool agent
 * reads to decide which containers should exist. Delete the user first and the
 * agent simply stops seeing the row, leaving a container running for ever with
 * the trader's broker password inside it. So: ask for the terminal to be torn
 * down, wait for the agent to confirm it is gone, and only then delete.
 */
export async function adminDeleteUserAction(userId: string): Promise<AdminActionResult> {
  const g = await guard();
  if ("error" in g) return g;
  if (g.adminId === userId) return { error: "You cannot delete your own account here." };

  const supabase = createServiceClient();
  const { data: instances, error: readError } = await supabase
    .from("mt5_instances")
    .select("account_id, desired_state, status")
    .eq("user_id", userId);
  if (readError) {
    log.error("admin delete: instance lookup failed", { detail: readError.message, userId });
    return { error: "Could not check the user's cloud terminal." };
  }

  const notAskedToGo = (instances ?? []).filter((i) => i.desired_state !== "removed");
  if (notAskedToGo.length > 0) {
    const { error } = await supabase
      .from("mt5_instances")
      .update({ desired_state: "removed", updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) return { error: "Could not stop the cloud terminal, so nothing was deleted." };
    log.warn("admin delete: asked the pool to remove the terminal", {
      detail: `admin=${g.adminId} user=${userId}`,
    });
    revalidatePath("/admin/users");
    return { pending: "Shutting their cloud terminal down. Press Delete again in about a minute to finish." };
  }

  const stillThere = (instances ?? []).filter((i) => i.status !== "removed");
  if (stillThere.length > 0) {
    return {
      pending: `Still removing the cloud terminal (status: ${stillThere[0].status}). Try again shortly.`,
    };
  }

  // Belt and braces: the cascade would take these anyway, but a revoked key
  // stops being accepted the moment this runs, even if the delete below fails.
  await supabase.from("api_keys").update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId).is("revoked_at", null);

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    log.error("admin delete user failed", { detail: error.message, userId });
    return { error: `Could not delete the account: ${error.message}` };
  }
  log.warn("admin deleted a user", { detail: `admin=${g.adminId} user=${userId}` });
  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return { ok: true };
}

/** Inbox: mark a message dealt with (or reopen it), so support doesn't double-answer. */
export async function adminSetHandledAction(id: string, handled: boolean): Promise<AdminActionResult> {
  const g = await guard();
  if ("error" in g) return g;

  const { error } = await createServiceClient()
    .from("contact_messages")
    .update({ handled_at: handled ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) {
    log.error("admin inbox update failed", { detail: error.message, id });
    return { error: "Could not update the message." };
  }
  revalidatePath("/admin/inbox");
  revalidatePath("/admin");
  return { ok: true };
}

/** Inbox: support has dealt with this account's connection problem. */
export async function adminHandleConnectionAction(accountId: string): Promise<AdminActionResult> {
  const g = await guard();
  if ("error" in g) return g;

  const { error } = await createServiceClient()
    .from("connection_events")
    .update({ handled_at: new Date().toISOString() })
    .eq("account_id", accountId)
    .neq("level", "info")
    .is("handled_at", null);
  if (error) {
    log.error("admin connection handle failed", { detail: error.message, accountId });
    return { error: "Could not update the connection log." };
  }
  revalidatePath("/admin/inbox");
  revalidatePath("/admin");
  return { ok: true };
}

/* ---------------------------------------------------------------- brokers */

const brokerInput = z.object({
  id: z.number().int().positive().optional(),
  broker: z.string().trim().min(1, "Name the broker.").max(80),
  label: z.string().trim().min(1, "Name which of their servers this is.").max(80),
  address: z.string().trim().min(3).max(120),
  kind: z.enum(["demo", "live"]),
  help: z.string().trim().max(600).optional(),
  note: z.string().trim().max(600).optional(),
  /** Set when the row comes from a trader who actually signed in through it. */
  verifiedServer: z.string().trim().max(80).optional(),
});

export type BrokerInput = z.input<typeof brokerInput>;

/**
 * Add or edit a server in the picker.
 *
 * Addresses only. A broker NAME resolves solely when it is already inside the
 * image's encrypted servers.dat - ours holds MetaQuotes and a hand-seeded Exness
 * - so a name saved here would never connect for anybody, and it would fail at
 * login with a message the trader cannot act on.
 */
export async function adminSaveBrokerAction(input: BrokerInput): Promise<AdminActionResult> {
  const g = await guard();
  if ("error" in g) return g;

  const parsed = brokerInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const { id, verifiedServer, ...row } = parsed.data;

  if (!isValidServerAddress(row.address)) {
    return {
      error:
        `"${row.address}" is a server name, not an address. MetaTrader can only resolve a name ` +
        "it already knows, so the picker needs the broker's access point, like " +
        "mt5-demo.yourbroker.com:443.",
    };
  }

  const db = createServiceClient();
  const now = new Date().toISOString();
  // A trader having signed in through it IS the verification - the agent only
  // records "Connected to <server>" after MetaTrader reported authorisation.
  const verified = verifiedServer
    ? { verified_at: now, verified_server: verifiedServer, source: "trader" as const }
    : null;

  const { error } = id
    ? await db.from("mt5_brokers").update({ ...row, ...(verified ?? {}), updated_at: now }).eq("id", id)
    : await db.from("mt5_brokers").insert({ ...row, ...(verified ?? { source: "admin" as const }) });

  if (error) {
    log.error("admin broker save failed", { detail: error.message });
    return {
      error: error.code === "23505"
        ? "That address is already in the list."
        : "Could not save the broker.",
    };
  }
  // Check it without being asked. An address nobody has verified is exactly
  // what this feature exists to prevent, and an admin should not have to
  // remember a second click. A trader-verified row needs no probe: someone has
  // already signed in through it.
  if (!verifiedServer) {
    const { error: probeError } = await db
      .from("broker_probes")
      .insert({ address: row.address, requested_by: g.adminId });
    if (probeError) log.error("broker probe not queued on save", { detail: probeError.message });
  }

  revalidatePath("/admin/brokers");
  revalidatePath("/dashboard/ea-setup");
  return {
    ok: true,
    pending: verifiedServer
      ? undefined
      : `Saved. Checking ${row.address} answers as a MetaTrader server — refresh in a minute or two.`,
  };
}

/** Take a broker out of the picker without losing the row, or put it back. */
export async function adminSetBrokerEnabledAction(
  id: number,
  enabled: boolean,
): Promise<AdminActionResult> {
  const g = await guard();
  if ("error" in g) return g;

  const { error } = await createServiceClient()
    .from("mt5_brokers")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    log.error("admin broker toggle failed", { detail: error.message, accountId: String(id) });
    return { error: "Could not update the broker." };
  }
  revalidatePath("/admin/brokers");
  revalidatePath("/dashboard/ea-setup");
  return { ok: true };
}

/**
 * Ask a pool box whether an address answers as a MetaTrader server.
 *
 * It cannot be answered here: reaching an MT5 server means speaking its
 * protocol, and a TCP connection proves nothing - mt5.roboforex.com and
 * mt5.xm.com both accept one on 443 and neither is an MT5 server. So the job is
 * queued and the agent runs a throwaway terminal against it, which takes about
 * a minute and a half.
 */
export async function adminProbeBrokerAction(address: string): Promise<AdminActionResult> {
  const g = await guard();
  if ("error" in g) return g;

  const trimmed = address.trim();
  if (!isAcceptableServer(trimmed)) {
    return { error: "That is not an address or a server name we could try." };
  }

  const { error } = await createServiceClient()
    .from("broker_probes")
    .insert({ address: trimmed, requested_by: g.adminId });
  if (error) {
    log.error("broker probe not queued", { detail: error.message });
    return { error: "Could not start the check." };
  }
  revalidatePath("/admin/brokers");
  return { pending: `Checking ${trimmed}. A pool box runs a real terminal against it — refresh in a minute or two.` };
}

/**
 * Try the usual hostname shapes for a broker's domain and check what answers.
 *
 * Two stages, because the stages cost wildly different amounts. DNS and a TCP
 * connect are seconds and run here, in parallel, against all fifteen candidates;
 * only what survives is handed to a pool box, where each check costs a real
 * terminal and about two minutes. Measured on icmarkets.com: fifteen candidates,
 * three answered TCP, and the terminal then showed two of those were genuinely
 * MetaTrader servers.
 *
 * Nothing is added to the picker here. This produces evidence for an admin to
 * act on, which is the whole point of not guessing.
 */
export async function adminFindBrokerServersAction(domain: string): Promise<AdminActionResult> {
  const g = await guard();
  if ("error" in g) return g;

  const bare = normaliseDomain(domain);
  if (!bare) {
    return { error: "Enter the broker's website domain, like tickmill.com." };
  }

  const candidates = candidateAddresses(bare);
  // reachable() refuses anything that is not public unicast, so a domain that
  // resolves inward cannot turn this into a scan of the private network.
  const answered = (
    await Promise.all(candidates.map(async (a) => ((await reachable(a, 4000)) ? a : null)))
  ).filter((a): a is string => a !== null);

  if (answered.length === 0) {
    return {
      error:
        `None of the ${candidates.length} usual addresses for ${bare} answered. This broker does ` +
        "not follow the common naming, so ask their support for the MT5 access point.",
    };
  }

  const { error } = await createServiceClient()
    .from("broker_probes")
    .insert(answered.map((address) => ({ address, requested_by: g.adminId })));
  if (error) {
    log.error("candidate probes not queued", { detail: error.message });
    return { error: "Found candidates but could not start the checks." };
  }

  revalidatePath("/admin/brokers");
  return {
    pending:
      `${answered.length} of ${candidates.length} candidates for ${bare} answered. Checking whether ` +
      "they are really MetaTrader servers — that takes a couple of minutes each, and the answers " +
      "appear under Recent checks.",
  };
}

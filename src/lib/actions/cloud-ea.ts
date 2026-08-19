"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthedActionContext } from "@/lib/actions/_helpers";
import { API_KEY_PREFIX, hashApiKey } from "@/lib/ea-auth";
import { sealSecret } from "@/lib/mt5-crypto";
import { isAcceptableServer } from "@/lib/mt5-brokers";
import { toActionErrorMessage } from "@/lib/action-error";
import { log } from "@/lib/log";

const enableSchema = z.object({
  login: z.string().trim().regex(/^\d{4,15}$/, "MT5 login is the account number, digits only."),
  password: z.string().min(1, "Enter your MT5 password.").max(200),
  server: z.string().trim().min(1, "Choose your broker."),
});

export type EnableCloudEaInput = z.infer<typeof enableSchema>;

/**
 * Turns on 24/7 cloud protection: mints a dedicated EA key, seals the broker
 * password, and records the desired state. A pool server picks the row up
 * within ~15s and provisions the container -- this action never talks to a
 * server directly, so it stays fast and can't fail because a pool box is busy.
 */
export async function enableCloudEaAction(
  input: EnableCloudEaInput
): Promise<{ error: string | null }> {
  try {
    const parsed = enableSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Check the details and try again." };
    }
    const { login, password, server } = parsed.data;

    // MT5 can only resolve a bare server NAME if it is already in the image's
    // servers.dat; an address always works. Catch the wrong form here rather
    // than letting provisioning fail later with an opaque "no connection".
    if (!isAcceptableServer(server)) {
      return {
        error:
          "Enter your broker's server address as host:port (for example live.yourbroker.com:443) " +
          "-- the server name alone won't work. Your broker's support can tell you the address.",
      };
    }

    const ctx = await getAuthedActionContext();
    if (!ctx.ok) return { error: ctx.error };
    const { supabase, userId, account } = ctx;

    // A dedicated key, so the user can keep (or revoke) their desktop EA key
    // independently and we can tell the two apart in the audit trail.
    const rawKey = `${API_KEY_PREFIX}${randomBytes(24).toString("hex")}`;
    const { data: key, error: keyError } = await supabase
      .from("api_keys")
      .insert({
        user_id: userId,
        account_id: account.id,
        label: "Cloud EA",
        key_prefix: rawKey.slice(0, API_KEY_PREFIX.length + 8),
        key_hash: hashApiKey(rawKey),
      })
      .select("id")
      .single();

    if (keyError || !key) {
      log.error("cloud ea key insert failed", {
        detail: keyError?.message,
        accountId: account.id,
      });
      return { error: "Couldn't set up cloud protection. Please try again." };
    }

    const { error } = await supabase.from("mt5_instances").upsert(
      {
        account_id: account.id,
        user_id: userId,
        mt5_login: login,
        mt5_server: server,
        mt5_password_cipher: sealSecret(password),
        ea_key_cipher: sealSecret(rawKey),
        api_key_id: key.id,
        desired_state: "running",
        status: "pending",
        status_detail: null,
        // Force a re-claim so a re-enable lands on a server with capacity now.
        server_host: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" }
    );

    if (error) {
      log.error("cloud ea upsert failed", { detail: error.message, accountId: account.id });
      return { error: "Couldn't set up cloud protection. Please try again." };
    }

    revalidatePath("/dashboard/ea-setup");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err, "cloud-ea") };
  }
}

/** Tears the hosted terminal down. The agent removes the container and volume. */
export async function disableCloudEaAction(): Promise<{ error: string | null }> {
  try {
    const ctx = await getAuthedActionContext();
    if (!ctx.ok) return { error: ctx.error };
    const { supabase, account } = ctx;

    const { error } = await supabase
      .from("mt5_instances")
      .update({ desired_state: "removed", updated_at: new Date().toISOString() })
      .eq("account_id", account.id);

    if (error) {
      log.error("cloud ea disable failed", { detail: error.message, accountId: account.id });
      return { error: "Couldn't turn off cloud protection. Please try again." };
    }

    revalidatePath("/dashboard/ea-setup");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err, "cloud-ea") };
  }
}

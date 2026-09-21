"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/admin";
import { getAuthedUser } from "@/lib/data/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { log } from "@/lib/log";

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

  const { error } = await createServiceClient()
    .from("mt5_instances")
    .update({ desired_state: "removed", updated_at: new Date().toISOString() })
    .eq("account_id", accountId);
  if (error) {
    log.error("admin disable cloud ea failed", { detail: error.message, accountId });
    return { error: "Could not stop the cloud terminal." };
  }
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

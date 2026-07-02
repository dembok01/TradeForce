import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryAccount, type Account, type ServerClient } from "@/lib/data/account";

export type AuthedActionContext = {
  supabase: ServerClient;
  userId: string;
  account: Account;
};

/**
 * Shared setup for authenticated write actions: one client, the current user,
 * and their primary account. Returns a discriminated result so callers bail
 * with a clean "Not authenticated." message instead of the generic network
 * fallback. Replaces the auth.getUser()/account boilerplate duplicated across
 * the write actions.
 */
export async function getAuthedActionContext(): Promise<
  ({ ok: true } & AuthedActionContext) | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };
  const account = await getOrCreatePrimaryAccount(supabase);
  return { ok: true, supabase, userId: user.id, account };
}

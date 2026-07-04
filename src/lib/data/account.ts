import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAuthedUser } from "@/lib/data/auth";
import type { Database } from "@/lib/supabase/database.types";

export type Account = Database["public"]["Tables"]["accounts"]["Row"];
export type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Every dashboard page needs the current user's primary account. Phase 1 has
 * exactly one account per user, created lazily on first use — normally by the
 * onboarding wizard's completion action, or on first dashboard read as a
 * fallback — so trading_rules/trades/violations have somewhere to attach.
 *
 * Pass an existing client to avoid building a second one (see getAccountContext).
 */
export async function getOrCreatePrimaryAccount(client?: ServerClient): Promise<Account> {
  const supabase = client ?? (await createClient());
  const user = await getAuthedUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const { data: existing, error: readError } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_primary", true)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  if (existing) {
    return existing;
  }

  const { data: created, error } = await supabase
    .from("accounts")
    .insert({ user_id: user.id, name: "Primary Account", is_primary: true })
    .select("*")
    .single();

  // Two parallel first reads can both miss and both insert; the partial unique
  // index (accounts_one_primary_per_user_idx) rejects the loser with 23505 —
  // re-read and use the winner's row.
  if (error?.code === "23505") {
    const { data: winner, error: rereadError } = await supabase
      .from("accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_primary", true)
      .maybeSingle();
    if (rereadError) throw new Error(rereadError.message);
    if (winner) return winner;
  }

  if (error || !created) {
    throw new Error(error?.message ?? "Failed to create account");
  }

  return created;
}

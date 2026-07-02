import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type Account = Database["public"]["Tables"]["accounts"]["Row"];
export type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Every dashboard page needs the current user's primary account. Phase 1 has
 * exactly one account per user, created lazily on first dashboard visit
 * (there's no onboarding wizard yet — the account just needs to exist so
 * trading_rules/trades/violations have somewhere to attach).
 *
 * Pass an existing client to avoid building a second one (see getAccountContext).
 */
export async function getOrCreatePrimaryAccount(client?: ServerClient): Promise<Account> {
  const supabase = client ?? (await createClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const { data: existing } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_primary", true)
    .maybeSingle();

  if (existing) {
    return existing;
  }

  const { data: created, error } = await supabase
    .from("accounts")
    .insert({ user_id: user.id, name: "Primary Account", is_primary: true })
    .select("*")
    .single();

  if (error || !created) {
    throw new Error(error?.message ?? "Failed to create account");
  }

  return created;
}

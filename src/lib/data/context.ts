import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryAccount, type Account, type ServerClient } from "@/lib/data/account";

export type AccountContext = { supabase: ServerClient; account: Account };

/**
 * Shared read-path entry point for the dashboard data modules: one server
 * client, resolved once, plus the caller's primary account. Replaces the
 * repeated `createClient()` + `getOrCreatePrimaryAccount()` pair, which
 * otherwise built two clients per read.
 */
export async function getAccountContext(): Promise<AccountContext> {
  const supabase = await createClient();
  const account = await getOrCreatePrimaryAccount(supabase);
  return { supabase, account };
}

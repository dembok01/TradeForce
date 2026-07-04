import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryAccount, type Account, type ServerClient } from "@/lib/data/account";

export type AccountContext = { supabase: ServerClient; account: Account };

/**
 * Shared read-path entry point for the dashboard data modules: one server
 * client and one primary-account read per request (cache()), no matter how
 * many data modules run in a render.
 */
export const getAccountContext = cache(async (): Promise<AccountContext> => {
  const supabase = await createClient();
  const account = await getOrCreatePrimaryAccount(supabase);
  return { supabase, account };
});

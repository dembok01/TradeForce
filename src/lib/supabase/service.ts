import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Service-role client — bypasses RLS. Only for server code that must look up
 * rows across users by a non-auth.uid() key (e.g. the EA's API-key lookup in
 * app/api/ea/**, where the caller is a desktop bot, not a signed-in browser).
 * Never import this into anything that runs in or is reachable from the browser.
 */
export function createServiceClient() {
  const env = serverEnv();
  return createSupabaseClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

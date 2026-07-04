import "server-only";
import { zonedStartOfDay } from "@/lib/time-boundaries";
import { getRequestTimezone } from "@/lib/data/rules";
import type { Account, ServerClient } from "@/lib/data/account";

// Error policy for page-powering reads: THROW. The dashboard error boundary
// exists to catch these — a visible retry beats silently-wrong discipline data
// (the old `?? []` fallbacks could render a false "clean record" on a failed
// query).

/** Run a head-only exact-count query, throwing on error. */
export async function countExact(
  build: () => PromiseLike<{ count: number | null; error: { message: string } | null }>
): Promise<number> {
  const { count, error } = await build();
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Most recent authentication by any live (non-revoked) EA key, or null. */
export async function getEaLastSeenAt(
  supabase: ServerClient,
  accountId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("api_keys")
    .select("last_used_at")
    .eq("account_id", accountId)
    .is("revoked_at", null)
    .not("last_used_at", "is", null)
    .order("last_used_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.last_used_at ?? null;
}

/**
 * Today's logged trades reduced to the two numbers every overview needs,
 * with "today" starting at the account's local midnight, not the server's.
 * Shared by the dashboard and trading-plan reads, which previously duplicated
 * the startOfDay → select pnl → reduce sequence verbatim.
 */
export async function getTodayTradeStats(
  supabase: ServerClient,
  account: Account
): Promise<{ todayPnl: number; todayTradeCount: number }> {
  const timezone = await getRequestTimezone();
  const todayStart = zonedStartOfDay(timezone).toISOString();
  const { data, error } = await supabase
    .from("trades")
    .select("pnl")
    .eq("account_id", account.id)
    .gte("entry_time", todayStart);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  return {
    todayPnl: rows.reduce((sum, t) => sum + (t.pnl ?? 0), 0),
    todayTradeCount: rows.length,
  };
}

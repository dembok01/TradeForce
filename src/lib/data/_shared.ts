import "server-only";
import { startOfDay } from "date-fns";
import type { ServerClient } from "@/lib/data/account";

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

/**
 * Today's logged trades reduced to the two numbers every overview needs.
 * Shared by the dashboard and trading-plan reads, which previously duplicated
 * the startOfDay → select pnl → reduce sequence verbatim.
 */
export async function getTodayTradeStats(
  supabase: ServerClient,
  accountId: string
): Promise<{ todayPnl: number; todayTradeCount: number }> {
  const todayStart = startOfDay(new Date()).toISOString();
  const { data, error } = await supabase
    .from("trades")
    .select("pnl")
    .eq("account_id", accountId)
    .gte("entry_time", todayStart);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  return {
    todayPnl: rows.reduce((sum, t) => sum + (t.pnl ?? 0), 0),
    todayTradeCount: rows.length,
  };
}

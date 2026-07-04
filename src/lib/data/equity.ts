import "server-only";
import { getAccountContext } from "@/lib/data/context";

export type EquityPoint = { at: string; equity: number };

/**
 * Downsampled equity history for the overview sparkline. The SQL function
 * bucket-averages account_snapshots (default: last 24h in 15-minute buckets),
 * so the raw 60-second history never crosses the wire.
 */
export async function getEquitySparkline(hours = 24): Promise<EquityPoint[]> {
  const { supabase, account } = await getAccountContext();
  const { data, error } = await supabase.rpc("equity_sparkline", {
    p_account_id: account.id,
    p_hours: hours,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ at: row.bucket_start, equity: Number(row.equity) }));
}

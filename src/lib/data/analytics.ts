import "server-only";
import { toZonedTime } from "date-fns-tz";
import { getAccountContext } from "@/lib/data/context";
import { getRequestTimezone } from "@/lib/data/rules";
import { shapeAnalytics, type PnlBucket, type ShapedAnalytics } from "@/lib/analytics-buckets";

export type { PnlBucket };
export type AnalyticsOverview = ShapedAnalytics;

/**
 * Aggregation happens in SQL (trades_pnl_buckets, timezone-aware wall-clock
 * bucketing): ~21 tiny rows cross the wire instead of six months of trade
 * rows getting bucketed in JS on every render.
 */
export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  const { supabase, account } = await getAccountContext();
  const timezone = await getRequestTimezone();

  const { data, error } = await supabase.rpc("trades_pnl_buckets", {
    p_account_id: account.id,
    p_tz: timezone,
  });
  if (error) throw new Error(error.message);

  return shapeAnalytics(data ?? [], toZonedTime(new Date(), timezone));
}

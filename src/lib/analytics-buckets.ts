import { addDays, addMonths, addWeeks, format, startOfDay, startOfMonth, startOfWeek } from "date-fns";

// Row shape returned by the trades_pnl_buckets SQL function: one row per
// non-empty local day (last 7) / week (last 8, Sunday-start) / month (last 6),
// with bucket_date = the local date the bucket starts on.
export type PnlBucketRow = {
  kind: string;
  bucket_date: string;
  pnl: number;
  trade_count: number;
  win_count: number;
};

export type PnlBucket = { label: string; pnl: number };

export type ShapedAnalytics = {
  winRatePercent: number;
  tradesThisWeek: number;
  tradesThisMonth: number;
  dailyPnl: PnlBucket[];
  weeklyPnl: PnlBucket[];
  monthlyPnl: PnlBucket[];
};

const dateKey = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * Expand the sparse SQL bucket rows into the fixed 7/8/6 chart windows
 * (empty buckets render as 0), and derive the headline stats. `wallNow` is
 * "now" on the account's wall clock — the same clock the SQL grouped by.
 */
export function shapeAnalytics(rows: PnlBucketRow[], wallNow: Date): ShapedAnalytics {
  const byKind = (kind: string) => {
    const map = new Map<string, PnlBucketRow>();
    for (const row of rows) if (row.kind === kind) map.set(row.bucket_date, row);
    return map;
  };
  const days = byKind("day");
  const weeks = byKind("week");
  const months = byKind("month");

  const dailyPnl = Array.from({ length: 7 }, (_, i) => {
    const wallDay = addDays(startOfDay(wallNow), -(6 - i));
    return { label: format(wallDay, "EEE"), pnl: Number(days.get(dateKey(wallDay))?.pnl ?? 0) };
  });

  const weeklyPnl = Array.from({ length: 8 }, (_, i) => {
    const wallWeek = addWeeks(startOfWeek(wallNow), -(7 - i));
    return { label: format(wallWeek, "MMM d"), pnl: Number(weeks.get(dateKey(wallWeek))?.pnl ?? 0) };
  });

  const monthlyPnl = Array.from({ length: 6 }, (_, i) => {
    const wallMonth = addMonths(startOfMonth(wallNow), -(5 - i));
    return { label: format(wallMonth, "MMM"), pnl: Number(months.get(dateKey(wallMonth))?.pnl ?? 0) };
  });

  // Month rows cover the whole 6-month window, so they carry the win-rate
  // totals; day/week rows are trimmed windows and would undercount.
  let totalTrades = 0;
  let wins = 0;
  for (const row of months.values()) {
    totalTrades += row.trade_count;
    wins += row.win_count;
  }
  const winRatePercent = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  const tradesThisWeek = weeks.get(dateKey(startOfWeek(wallNow)))?.trade_count ?? 0;
  const tradesThisMonth = months.get(dateKey(startOfMonth(wallNow)))?.trade_count ?? 0;

  return { winRatePercent, tradesThisWeek, tradesThisMonth, dailyPnl, weeklyPnl, monthlyPnl };
}

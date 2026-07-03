import "server-only";
import { startOfDay, startOfWeek, startOfMonth, addDays, addWeeks, addMonths, format } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { getAccountContext } from "@/lib/data/context";
import { resolveAccountTimezone } from "@/lib/data/_shared";

export type PnlBucket = { label: string; pnl: number };

export type AnalyticsOverview = {
  winRatePercent: number;
  tradesThisWeek: number;
  tradesThisMonth: number;
  dailyPnl: PnlBucket[];
  weeklyPnl: PnlBucket[];
  monthlyPnl: PnlBucket[];
};

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  const { supabase, account } = await getAccountContext();
  const timezone = await resolveAccountTimezone(supabase, account);

  // All bucket boundaries are computed on the account's wall clock, then
  // converted back to UTC instants for comparison — so a 1am-IST trade lands
  // in the IST day/week/month it happened in, not the server's.
  const wallNow = toZonedTime(new Date(), timezone);
  const toUtc = (wall: Date) => fromZonedTime(wall, timezone);

  const sixMonthsAgo = toUtc(addMonths(startOfMonth(wallNow), -5)).toISOString();
  const { data: trades, error } = await supabase
    .from("trades")
    .select("pnl, entry_time")
    .eq("account_id", account.id)
    .gte("entry_time", sixMonthsAgo)
    .not("pnl", "is", null);
  if (error) throw new Error(error.message);

  const rows = trades ?? [];

  const wins = rows.filter((t) => (t.pnl ?? 0) > 0).length;
  const winRatePercent = rows.length > 0 ? (wins / rows.length) * 100 : 0;

  const weekStart = toUtc(startOfWeek(wallNow));
  const monthStart = toUtc(startOfMonth(wallNow));
  const tradesThisWeek = rows.filter((t) => new Date(t.entry_time) >= weekStart).length;
  const tradesThisMonth = rows.filter((t) => new Date(t.entry_time) >= monthStart).length;

  const sumBetween = (from: Date, to: Date) =>
    rows
      .filter((t) => new Date(t.entry_time) >= from && new Date(t.entry_time) < to)
      .reduce((sum, t) => sum + (t.pnl ?? 0), 0);

  // Daily P/L — last 7 days
  const dailyPnl: PnlBucket[] = Array.from({ length: 7 }, (_, i) => {
    const wallDay = addDays(startOfDay(wallNow), -(6 - i));
    return {
      label: format(wallDay, "EEE"),
      pnl: sumBetween(toUtc(wallDay), toUtc(addDays(wallDay, 1))),
    };
  });

  // Weekly P/L — last 8 weeks
  const weeklyPnl: PnlBucket[] = Array.from({ length: 8 }, (_, i) => {
    const wallWeek = addWeeks(startOfWeek(wallNow), -(7 - i));
    return {
      label: format(wallWeek, "MMM d"),
      pnl: sumBetween(toUtc(wallWeek), toUtc(addWeeks(wallWeek, 1))),
    };
  });

  // Monthly P/L — last 6 months
  const monthlyPnl: PnlBucket[] = Array.from({ length: 6 }, (_, i) => {
    const wallMonth = addMonths(startOfMonth(wallNow), -(5 - i));
    return {
      label: format(wallMonth, "MMM"),
      pnl: sumBetween(toUtc(wallMonth), toUtc(addMonths(wallMonth, 1))),
    };
  });

  return { winRatePercent, tradesThisWeek, tradesThisMonth, dailyPnl, weeklyPnl, monthlyPnl };
}

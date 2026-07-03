import "server-only";
import {
  startOfDay,
  startOfWeek,
  startOfMonth,
  subDays,
  subWeeks,
  subMonths,
  format,
} from "date-fns";
import { getAccountContext } from "@/lib/data/context";

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

  const sixMonthsAgo = subMonths(startOfMonth(new Date()), 5).toISOString();
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

  const weekStart = startOfWeek(new Date());
  const monthStart = startOfMonth(new Date());
  const tradesThisWeek = rows.filter((t) => new Date(t.entry_time) >= weekStart).length;
  const tradesThisMonth = rows.filter((t) => new Date(t.entry_time) >= monthStart).length;

  // Daily P/L — last 7 days
  const dailyPnl: PnlBucket[] = Array.from({ length: 7 }, (_, i) => {
    const day = subDays(startOfDay(new Date()), 6 - i);
    const nextDay = subDays(day, -1);
    const pnl = rows
      .filter((t) => new Date(t.entry_time) >= day && new Date(t.entry_time) < nextDay)
      .reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    return { label: format(day, "EEE"), pnl };
  });

  // Weekly P/L — last 8 weeks
  const weeklyPnl: PnlBucket[] = Array.from({ length: 8 }, (_, i) => {
    const week = subWeeks(startOfWeek(new Date()), 7 - i);
    const nextWeek = subWeeks(week, -1);
    const pnl = rows
      .filter((t) => new Date(t.entry_time) >= week && new Date(t.entry_time) < nextWeek)
      .reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    return { label: format(week, "MMM d"), pnl };
  });

  // Monthly P/L — last 6 months
  const monthlyPnl: PnlBucket[] = Array.from({ length: 6 }, (_, i) => {
    const month = subMonths(startOfMonth(new Date()), 5 - i);
    const nextMonth = subMonths(month, -1);
    const pnl = rows
      .filter((t) => new Date(t.entry_time) >= month && new Date(t.entry_time) < nextMonth)
      .reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    return { label: format(month, "MMM"), pnl };
  });

  return { winRatePercent, tradesThisWeek, tradesThisMonth, dailyPnl, weeklyPnl, monthlyPnl };
}

import "server-only";
import { getAccountContext } from "@/lib/data/context";
import { countExact, getEaLastSeenAt, getTodayTradeStats } from "@/lib/data/_shared";
import { getAccountRules, getRequestTimezone } from "@/lib/data/rules";
import { deriveStatus, deriveDayLock, type AccountStatus, type DayLock } from "@/lib/risk-status";
import { zonedStartOfDay, zonedNextMidnight } from "@/lib/time-boundaries";

export type { AccountStatus };

export type DashboardOverview = {
  accountId: string;
  currentEquity: number | null;
  todayPnl: number;
  todayTradeCount: number;
  hasTradesData: boolean;
  dailyLossLimit: number | null;
  maxTradesPerDay: number | null;
  dailyLossRemaining: number | null;
  tradesRemainingToday: number | null;
  violationsAllTime: number;
  eaLastSeenAt: string | null;
  /** Why the EA can't trade right now (EA v1.27+), null when it can. */
  eaTradeBlock: string | null;
  /** Set when the EA has stopped the trader for the rest of their day. */
  lock: DayLock | null;
  status: AccountStatus;
};

export async function getDashboardOverview(): Promise<DashboardOverview> {
  const { supabase, account } = await getAccountContext();

  const timezone = await getRequestTimezone();
  const [rules, todayStats, violationsAllTime, eaLastSeenAt, { data: breach }] = await Promise.all([
    getAccountRules(),
    getTodayTradeStats(supabase, account),
    countExact(() =>
      supabase
        .from("violations")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account.id)
    ),
    getEaLastSeenAt(supabase, account.id),
    // The EA's own word that the day is over: it closed everything and now
    // closes anything new until the trader's midnight.
    supabase
      .from("violations")
      .select("occurred_at")
      .eq("account_id", account.id)
      .eq("type", "DAILY_LOSS_BREACH")
      .gte("occurred_at", zonedStartOfDay(timezone).toISOString())
      .order("occurred_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const { todayPnl, todayTradeCount } = todayStats;

  const dailyLossLimit = rules?.daily_loss_limit ?? null;
  const maxTradesPerDay = rules?.max_trades_per_day ?? null;

  return {
    accountId: account.id,
    currentEquity: account.current_equity,
    todayPnl,
    todayTradeCount,
    hasTradesData: todayTradeCount > 0,
    dailyLossLimit,
    maxTradesPerDay,
    dailyLossRemaining:
      dailyLossLimit !== null ? Math.max(0, dailyLossLimit - Math.max(0, -todayPnl)) : null,
    tradesRemainingToday:
      maxTradesPerDay !== null ? Math.max(0, maxTradesPerDay - todayTradeCount) : null,
    violationsAllTime,
    eaLastSeenAt,
    eaTradeBlock: account.ea_trade_block ?? null,
    lock: deriveDayLock({
      rulesActive: Boolean(rules?.is_active),
      lossBreachAt: breach?.occurred_at ?? null,
      todayTradeCount,
      maxTradesPerDay,
      nextMidnight: zonedNextMidnight(timezone).toISOString(),
    }),
    status: deriveStatus({
      hasRules: Boolean(rules),
      dailyLossLimit,
      todayPnl,
      maxTradesPerDay,
      todayTradeCount,
    }),
  };
}

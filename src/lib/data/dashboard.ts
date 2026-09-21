import "server-only";
import { getAccountContext } from "@/lib/data/context";
import { countExact, getEaLastSeenAt, getTodayTradeStats } from "@/lib/data/_shared";
import { getAccountRules } from "@/lib/data/rules";
import { deriveStatus, type AccountStatus } from "@/lib/risk-status";

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
  status: AccountStatus;
};

export async function getDashboardOverview(): Promise<DashboardOverview> {
  const { supabase, account } = await getAccountContext();

  const [rules, todayStats, violationsAllTime, eaLastSeenAt] = await Promise.all([
    getAccountRules(),
    getTodayTradeStats(supabase, account),
    countExact(() =>
      supabase
        .from("violations")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account.id)
    ),
    getEaLastSeenAt(supabase, account.id),
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
    status: deriveStatus({
      hasRules: Boolean(rules),
      dailyLossLimit,
      todayPnl,
      maxTradesPerDay,
      todayTradeCount,
    }),
  };
}

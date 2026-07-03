import "server-only";
import { getAccountContext } from "@/lib/data/context";
import { countExact, getTodayTradeStats } from "@/lib/data/_shared";
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
  status: AccountStatus;
};

export async function getDashboardOverview(): Promise<DashboardOverview> {
  const { supabase, account } = await getAccountContext();

  const [rulesRes, todayStats, violationsAllTime] = await Promise.all([
    supabase
      .from("trading_rules")
      .select("daily_loss_limit, max_trades_per_day")
      .eq("account_id", account.id)
      .maybeSingle(),
    getTodayTradeStats(supabase, account.id),
    countExact(() =>
      supabase
        .from("violations")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account.id)
    ),
  ]);
  if (rulesRes.error) throw new Error(rulesRes.error.message);

  const rules = rulesRes.data;
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
    status: deriveStatus({
      hasRules: Boolean(rules),
      dailyLossLimit,
      todayPnl,
      maxTradesPerDay,
      todayTradeCount,
    }),
  };
}

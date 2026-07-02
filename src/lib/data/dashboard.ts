import "server-only";
import { startOfDay } from "date-fns";
import { getAccountContext } from "@/lib/data/context";
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
  const todayStart = startOfDay(new Date()).toISOString();

  const [rulesRes, todayTradesRes, violationsRes] = await Promise.all([
    supabase
      .from("trading_rules")
      .select("daily_loss_limit, max_trades_per_day")
      .eq("account_id", account.id)
      .maybeSingle(),
    supabase
      .from("trades")
      .select("pnl")
      .eq("account_id", account.id)
      .gte("entry_time", todayStart),
    supabase
      .from("violations")
      .select("id", { count: "exact", head: true })
      .eq("account_id", account.id),
  ]);

  const rules = rulesRes.data;
  const todayTrades = todayTradesRes.data ?? [];
  const todayPnl = todayTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const todayTradeCount = todayTrades.length;
  const violationsAllTime = violationsRes.count ?? 0;

  const dailyLossLimit = rules?.daily_loss_limit ?? null;
  const maxTradesPerDay = rules?.max_trades_per_day ?? null;

  return {
    accountId: account.id,
    currentEquity: account.current_equity,
    todayPnl,
    todayTradeCount,
    hasTradesData: todayTrades.length > 0,
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

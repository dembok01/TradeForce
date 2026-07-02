export type AccountStatus = "not_configured" | "safe" | "warning" | "locked";

// Pure risk-state classifier, kept out of the server-only data module so it can
// be unit-tested directly. Used by the dashboard overview.
export function deriveStatus(params: {
  hasRules: boolean;
  dailyLossLimit: number | null;
  todayPnl: number;
  maxTradesPerDay: number | null;
  todayTradeCount: number;
}): AccountStatus {
  const { hasRules, dailyLossLimit, todayPnl, maxTradesPerDay, todayTradeCount } = params;
  if (!hasRules) return "not_configured";

  const lossRatio =
    dailyLossLimit && dailyLossLimit > 0 ? Math.max(0, -todayPnl) / dailyLossLimit : 0;
  const tradeRatio =
    maxTradesPerDay && maxTradesPerDay > 0 ? todayTradeCount / maxTradesPerDay : 0;

  if (lossRatio >= 1 || tradeRatio >= 1) return "locked";
  if (lossRatio >= 0.7 || tradeRatio >= 0.8) return "warning";
  return "safe";
}

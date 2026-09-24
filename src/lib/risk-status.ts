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

/**
 * The day is locked when the EA has stopped the trader for the rest of it:
 * after a daily-loss breach (it closed everything and closes anything new), or
 * once the daily trade cap is used up. Both last until the trader's own
 * midnight. Paused rules are not enforced at all, so nothing is locked.
 */
export type DayLock = {
  reason: "daily_loss" | "trade_cap";
  /** When the breach happened; null for a cap, which has no single moment. */
  since: string | null;
  /** The trader's next midnight, when trading opens again. */
  endsAt: string;
};

export function deriveDayLock(params: {
  rulesActive: boolean;
  lossBreachAt: string | null;
  todayTradeCount: number;
  maxTradesPerDay: number | null;
  nextMidnight: string;
}): DayLock | null {
  const { rulesActive, lossBreachAt, todayTradeCount, maxTradesPerDay, nextMidnight } = params;
  if (!rulesActive) return null;
  if (lossBreachAt) return { reason: "daily_loss", since: lossBreachAt, endsAt: nextMidnight };
  if (maxTradesPerDay && maxTradesPerDay > 0 && todayTradeCount >= maxTradesPerDay)
    return { reason: "trade_cap", since: null, endsAt: nextMidnight };
  return null;
}

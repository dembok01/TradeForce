import "server-only";
import { getAccountContext } from "@/lib/data/context";
import { countExact, getTodayTradeStats } from "@/lib/data/_shared";
import { SESSION_WINDOWS, isWithinUtcWindow, isCustomWindowActive } from "@/lib/trading-sessions";
import type { Database } from "@/lib/supabase/database.types";

export type TradingRules = Database["public"]["Tables"]["trading_rules"]["Row"];

export type ActiveSession = { key: string; label: string; enabled: boolean; active: boolean };

export type TradingPlanStatus = {
  rules: TradingRules | null;
  todayPnl: number;
  todayTradeCount: number;
  openPositionCount: number;
  sessions: ActiveSession[];
  anyEnabledSessionActive: boolean;
  ruleStatus: "active" | "warning" | "suspended";
};

export async function getTradingPlanStatus(): Promise<TradingPlanStatus> {
  const { supabase, account } = await getAccountContext();

  const [rulesRes, todayStats, openPositionCount] = await Promise.all([
    supabase.from("trading_rules").select("*").eq("account_id", account.id).maybeSingle(),
    getTodayTradeStats(supabase, account.id),
    countExact(() =>
      supabase
        .from("trades")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account.id)
        .is("exit_time", null)
    ),
  ]);
  if (rulesRes.error) throw new Error(rulesRes.error.message);

  const rules = rulesRes.data;
  const { todayPnl, todayTradeCount } = todayStats;

  const sessions: ActiveSession[] = rules
    ? [
        {
          key: "london",
          label: SESSION_WINDOWS.london.label,
          enabled: rules.session_london_enabled,
          active: isWithinUtcWindow(SESSION_WINDOWS.london.startUtc, SESSION_WINDOWS.london.endUtc),
        },
        {
          key: "newYork",
          label: SESSION_WINDOWS.newYork.label,
          enabled: rules.session_new_york_enabled,
          active: isWithinUtcWindow(SESSION_WINDOWS.newYork.startUtc, SESSION_WINDOWS.newYork.endUtc),
        },
        {
          key: "asian",
          label: SESSION_WINDOWS.asian.label,
          enabled: rules.session_asian_enabled,
          active: isWithinUtcWindow(SESSION_WINDOWS.asian.startUtc, SESSION_WINDOWS.asian.endUtc),
        },
        {
          key: "londonNyOverlap",
          label: SESSION_WINDOWS.londonNyOverlap.label,
          enabled: rules.session_london_ny_overlap_enabled,
          active: isWithinUtcWindow(
            SESSION_WINDOWS.londonNyOverlap.startUtc,
            SESSION_WINDOWS.londonNyOverlap.endUtc
          ),
        },
        {
          key: "custom",
          label: "Custom window",
          enabled: Boolean(rules.custom_session_start && rules.custom_session_end),
          active: isCustomWindowActive(rules.custom_session_start, rules.custom_session_end),
        },
      ]
    : [];

  const anyEnabledSessionActive = sessions.some((s) => s.enabled && s.active);
  const hasAnyEnabledSession = sessions.some((s) => s.enabled);

  let ruleStatus: TradingPlanStatus["ruleStatus"] = "suspended";
  if (rules?.is_active) {
    const lossRatio =
      rules.daily_loss_limit && rules.daily_loss_limit > 0
        ? Math.max(0, -todayPnl) / rules.daily_loss_limit
        : 0;
    const tradeRatio =
      rules.max_trades_per_day && rules.max_trades_per_day > 0
        ? todayTradeCount / rules.max_trades_per_day
        : 0;
    const outsideSession = hasAnyEnabledSession && !anyEnabledSessionActive;

    if (lossRatio >= 1 || tradeRatio >= 1) {
      ruleStatus = "suspended";
    } else if (lossRatio >= 0.7 || tradeRatio >= 0.8 || outsideSession) {
      ruleStatus = "warning";
    } else {
      ruleStatus = "active";
    }
  }

  return {
    rules,
    todayPnl,
    todayTradeCount,
    openPositionCount,
    sessions,
    anyEnabledSessionActive,
    ruleStatus,
  };
}

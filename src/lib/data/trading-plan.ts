import "server-only";
import { getAccountContext } from "@/lib/data/context";
import { countExact, getTodayTradeStats } from "@/lib/data/_shared";
import { getAccountRules, type TradingRules } from "@/lib/data/rules";
import { deriveStatus } from "@/lib/risk-status";
import {
  SESSION_WINDOWS,
  isWithinUtcWindow,
  isCustomWindowActive,
  parseTimeToUtcHours,
  type SessionKey,
} from "@/lib/trading-sessions";

export type { TradingRules };

export type ActiveSession = {
  key: string;
  label: string;
  enabled: boolean;
  active: boolean;
  startUtc: number;
  endUtc: number;
};

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

  const [rules, todayStats, openPositionCount] = await Promise.all([
    getAccountRules(),
    getTodayTradeStats(supabase, account),
    countExact(() =>
      supabase
        .from("trades")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account.id)
        .is("exit_time", null)
    ),
  ]);

  const { todayPnl, todayTradeCount } = todayStats;

  const presets: [SessionKey, boolean][] = rules
    ? [
        ["london", rules.session_london_enabled],
        ["newYork", rules.session_new_york_enabled],
        ["asian", rules.session_asian_enabled],
        ["londonNyOverlap", rules.session_london_ny_overlap_enabled],
      ]
    : [];
  const sessions: ActiveSession[] = presets.map(([key, enabled]) => {
    const w = SESSION_WINDOWS[key];
    return { key, label: w.label, enabled, active: isWithinUtcWindow(w.startUtc, w.endUtc), startUtc: w.startUtc, endUtc: w.endUtc };
  });
  if (rules?.custom_session_start && rules.custom_session_end) {
    sessions.push({
      key: "custom",
      label: "Custom window",
      enabled: true,
      active: isCustomWindowActive(rules.custom_session_start, rules.custom_session_end),
      startUtc: parseTimeToUtcHours(rules.custom_session_start),
      endUtc: parseTimeToUtcHours(rules.custom_session_end),
    });
  }

  const anyEnabledSessionActive = sessions.some((s) => s.enabled && s.active);
  const hasAnyEnabledSession = sessions.some((s) => s.enabled);

  // Same thresholds as the dashboard's status badge — deriveStatus is the one
  // source of truth; this page only adds the outside-session warning and maps
  // to its own label vocabulary (locked→suspended, safe→active).
  let ruleStatus: TradingPlanStatus["ruleStatus"] = "suspended";
  if (rules?.is_active) {
    const base = deriveStatus({
      hasRules: true,
      dailyLossLimit: rules.daily_loss_limit,
      todayPnl,
      maxTradesPerDay: rules.max_trades_per_day,
      todayTradeCount,
    });
    const outsideSession = hasAnyEnabledSession && !anyEnabledSessionActive;

    if (base === "locked") {
      ruleStatus = "suspended";
    } else if (base === "warning" || outsideSession) {
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

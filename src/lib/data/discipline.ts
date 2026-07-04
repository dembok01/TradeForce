import "server-only";
import { subDays } from "date-fns";
import { getAccountContext } from "@/lib/data/context";
import { getRequestTimezone } from "@/lib/data/rules";
import { zonedDateKey } from "@/lib/time-boundaries";
import { disciplineFromViolationCounts } from "@/lib/discipline-score";
import type { Database, ViolationType } from "@/lib/supabase/database.types";

export type DisciplineViolation = Pick<
  Database["public"]["Tables"]["violations"]["Row"],
  "id" | "type" | "details" | "occurred_at"
>;

export type DisciplineFactors = {
  ruleAdherence: number;
  sessionAdherence: number;
  overtradingPrevention: number;
  riskManagement: number;
  total: number;
  isEstimate: boolean;
  // The evidence behind the number: per-type counts over the scoring window
  // and the violations themselves, so the gauge can open into a breakdown
  // instead of being an unexplained figure.
  counts: Record<ViolationType, number>;
  recentViolations: DisciplineViolation[];
};

const SCORE_WINDOW_DAYS = 30;
const RECENT_LIMIT = 50;

/**
 * Prefers today's persisted discipline_scores row (written hourly by the
 * cron); falls back to a live estimate from the same violation window. Both
 * paths return the underlying violations — they're what a tap on the gauge
 * drills into.
 */
export async function getDisciplineScore(): Promise<DisciplineFactors> {
  const { supabase, account } = await getAccountContext();
  const timezone = await getRequestTimezone();
  const today = zonedDateKey(timezone);
  const since = subDays(new Date(), SCORE_WINDOW_DAYS).toISOString();

  const [existingRes, violationsRes] = await Promise.all([
    supabase
      .from("discipline_scores")
      .select("*")
      .eq("account_id", account.id)
      .eq("score_date", today)
      .maybeSingle(),
    supabase
      .from("violations")
      .select("id, type, details, occurred_at")
      .eq("account_id", account.id)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(RECENT_LIMIT),
  ]);
  if (existingRes.error) throw new Error(existingRes.error.message);
  if (violationsRes.error) throw new Error(violationsRes.error.message);

  const recentViolations = violationsRes.data ?? [];
  const counts: Record<ViolationType, number> = {
    OVERTRADING: 0,
    OUTSIDE_SESSION: 0,
    DAILY_LOSS_BREACH: 0,
    OPEN_POSITIONS_BREACH: 0,
    RISK_PER_TRADE_BREACH: 0,
  };
  for (const v of recentViolations) {
    counts[v.type] += 1;
  }

  const existing = existingRes.data;
  if (existing) {
    return {
      ruleAdherence: existing.rule_adherence_score,
      sessionAdherence: existing.session_adherence_score,
      overtradingPrevention: existing.overtrading_prevention_score,
      riskManagement: existing.risk_management_score,
      total: existing.total_score,
      isEstimate: false,
      counts,
      recentViolations,
    };
  }

  return { ...disciplineFromViolationCounts(counts), isEstimate: true, counts, recentViolations };
}

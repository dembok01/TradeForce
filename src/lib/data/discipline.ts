import "server-only";
import { subDays } from "date-fns";
import { getAccountContext } from "@/lib/data/context";
import { resolveAccountTimezone } from "@/lib/data/_shared";
import { zonedDateKey } from "@/lib/time-boundaries";
import { disciplineFromViolationCounts } from "@/lib/discipline-score";
import type { ViolationType } from "@/lib/supabase/database.types";

export type DisciplineFactors = {
  ruleAdherence: number;
  sessionAdherence: number;
  overtradingPrevention: number;
  riskManagement: number;
  total: number;
  isEstimate: boolean;
};

/**
 * Phase 1 has no scheduled job computing this daily (no EA feed to trigger one
 * off yet), so if today's discipline_scores row doesn't exist, this derives a
 * live estimate from the last 30 days of violations instead of just showing
 * a blank gauge. Phase 2 should add a daily cron that writes a real row here.
 */
export async function getDisciplineScore(): Promise<DisciplineFactors> {
  const { supabase, account } = await getAccountContext();
  const timezone = await resolveAccountTimezone(supabase, account);
  const today = zonedDateKey(timezone);

  const { data: existing, error: existingError } = await supabase
    .from("discipline_scores")
    .select("*")
    .eq("account_id", account.id)
    .eq("score_date", today)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  if (existing) {
    return {
      ruleAdherence: existing.rule_adherence_score,
      sessionAdherence: existing.session_adherence_score,
      overtradingPrevention: existing.overtrading_prevention_score,
      riskManagement: existing.risk_management_score,
      total: existing.total_score,
      isEstimate: false,
    };
  }

  const since = subDays(new Date(), 30).toISOString();
  const { data: violations, error: violationsError } = await supabase
    .from("violations")
    .select("type")
    .eq("account_id", account.id)
    .gte("occurred_at", since);
  if (violationsError) throw new Error(violationsError.message);

  const counts: Record<ViolationType, number> = {
    OVERTRADING: 0,
    OUTSIDE_SESSION: 0,
    DAILY_LOSS_BREACH: 0,
    OPEN_POSITIONS_BREACH: 0,
    RISK_PER_TRADE_BREACH: 0,
  };
  for (const v of violations ?? []) {
    counts[v.type] += 1;
  }

  return { ...disciplineFromViolationCounts(counts), isEstimate: true };
}

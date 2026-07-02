import type { ViolationType } from "@/lib/supabase/database.types";

export const VIOLATION_PENALTY = 12;

export function scoreFor(count: number): number {
  return Math.max(0, 100 - count * VIOLATION_PENALTY);
}

export type DisciplineBreakdown = {
  ruleAdherence: number;
  sessionAdherence: number;
  overtradingPrevention: number;
  riskManagement: number;
  total: number;
};

// Pure discipline-estimate math, extracted from the server-only data module so
// it can be unit-tested without a Supabase client.
export function disciplineFromViolationCounts(
  counts: Record<ViolationType, number>
): DisciplineBreakdown {
  const ruleAdherence = scoreFor(counts.DAILY_LOSS_BREACH + counts.OPEN_POSITIONS_BREACH);
  const sessionAdherence = scoreFor(counts.OUTSIDE_SESSION);
  const overtradingPrevention = scoreFor(counts.OVERTRADING);
  const riskManagement = scoreFor(counts.RISK_PER_TRADE_BREACH);
  const total = Math.round(
    (ruleAdherence + sessionAdherence + overtradingPrevention + riskManagement) / 4
  );
  return { ruleAdherence, sessionAdherence, overtradingPrevention, riskManagement, total };
}

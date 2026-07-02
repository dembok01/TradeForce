import { describe, it, expect } from "vitest";
import { scoreFor, disciplineFromViolationCounts } from "@/lib/discipline-score";

const clean = {
  OVERTRADING: 0,
  OUTSIDE_SESSION: 0,
  DAILY_LOSS_BREACH: 0,
  OPEN_POSITIONS_BREACH: 0,
  RISK_PER_TRADE_BREACH: 0,
};

describe("scoreFor", () => {
  it("is 100 with no violations", () => expect(scoreFor(0)).toBe(100));
  it("drops 12 points per violation", () => expect(scoreFor(3)).toBe(64));
  it("never goes below 0", () => expect(scoreFor(20)).toBe(0));
});

describe("disciplineFromViolationCounts", () => {
  it("is a perfect score for a clean record", () => {
    expect(disciplineFromViolationCounts(clean)).toEqual({
      ruleAdherence: 100,
      sessionAdherence: 100,
      overtradingPrevention: 100,
      riskManagement: 100,
      total: 100,
    });
  });

  it("folds daily-loss and open-position breaches into rule adherence", () => {
    const r = disciplineFromViolationCounts({ ...clean, DAILY_LOSS_BREACH: 1, OPEN_POSITIONS_BREACH: 1 });
    expect(r.ruleAdherence).toBe(76); // scoreFor(2)
  });

  it("averages the four factors into the total", () => {
    const r = disciplineFromViolationCounts({ ...clean, OVERTRADING: 2 });
    expect(r.overtradingPrevention).toBe(76);
    // round((100 + 100 + 76 + 100) / 4) = 94
    expect(r.total).toBe(94);
  });
});

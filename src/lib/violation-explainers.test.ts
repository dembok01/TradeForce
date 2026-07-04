import { describe, expect, it } from "vitest";
import { explainViolation, violationFigures } from "./violation-explainers";
import type { ViolationLike } from "./violation-explainers";

describe("explainViolation", () => {
  it("overtrading uses the exact numbers", () => {
    const v: ViolationLike = { type: "OVERTRADING", details: { tradesToday: 6, cap: 5 } };
    expect(explainViolation(v)).toBe(
      "Blocked — this would've been trade #6 today; your limit is 5."
    );
  });

  it("daily loss formats currency", () => {
    const v: ViolationLike = { type: "DAILY_LOSS_BREACH", details: { lossToday: -512.5, limit: 500 } };
    expect(explainViolation(v)).toContain("$512.50");
    expect(explainViolation(v)).toContain("$500.00");
  });

  it("locked-day repeat offence uses the reason branch", () => {
    const v: ViolationLike = {
      type: "DAILY_LOSS_BREACH",
      details: { reason: "account locked for the day after daily loss breach" },
    };
    expect(explainViolation(v)).toContain("already locked");
  });

  it("risk breach without stop-loss", () => {
    const v: ViolationLike = {
      type: "RISK_PER_TRADE_BREACH",
      details: { reason: "no stop loss attached", cap: 1 },
    };
    expect(explainViolation(v)).toBe("Closed — no stop-loss meant unbounded risk; your cap is 1%.");
  });

  it("tolerates empty details on every type", () => {
    const types = [
      "OVERTRADING",
      "OUTSIDE_SESSION",
      "DAILY_LOSS_BREACH",
      "OPEN_POSITIONS_BREACH",
      "RISK_PER_TRADE_BREACH",
    ] as const;
    for (const type of types) {
      expect(explainViolation({ type, details: {} })).toBeTruthy();
      expect(explainViolation({ type, details: null })).toBeTruthy();
    }
  });

  it("session violation prefers window bounds when present", () => {
    const v: ViolationLike = {
      type: "OUTSIDE_SESSION",
      details: { timeUtc: "18:42", windowStart: "08:00", windowEnd: "16:30" },
    };
    expect(explainViolation(v)).toContain("08:00–16:30");
  });
});

describe("violationFigures", () => {
  it("returns labeled pairs for known keys", () => {
    const figures = violationFigures({ type: "OVERTRADING", details: { tradesToday: 6, cap: 5 } });
    expect(figures).toEqual([
      { label: "Trade number", value: "6" },
      { label: "Daily cap", value: "5" },
    ]);
  });

  it("returns nothing for legacy empty details", () => {
    expect(violationFigures({ type: "OVERTRADING", details: {} })).toEqual([]);
  });
});

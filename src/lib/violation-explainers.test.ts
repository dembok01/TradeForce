import { describe, expect, it } from "vitest";
import { explainViolation, violationAction, violationFigures } from "./violation-explainers";
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

  it("blocked pending order reads as prevention, not a close", () => {
    const session: ViolationLike = {
      type: "OUTSIDE_SESSION",
      details: { blockedPendingOrder: true, windowStart: "08:00", windowEnd: "16:30", symbol: "EURUSD" },
    };
    expect(explainViolation(session)).toContain("Prevented");
    expect(explainViolation(session)).toContain("08:00–16:30");

    const cap: ViolationLike = {
      type: "OVERTRADING",
      details: { blockedPendingOrder: true, tradesToday: 6, cap: 5 },
    };
    expect(explainViolation(cap)).toContain("Prevented");
    expect(explainViolation(cap)).toContain("5");

    const loss: ViolationLike = {
      type: "DAILY_LOSS_BREACH",
      details: { blockedPendingOrder: true },
    };
    expect(explainViolation(loss)).toContain("Prevented");
  });

  it("auto-fixed risk breach reads as a repair, attached vs tightened", () => {
    const noSl: ViolationLike = {
      type: "RISK_PER_TRADE_BREACH",
      details: { autoFixed: true, reason: "no stop loss attached", cap: 1 },
    };
    expect(explainViolation(noSl)).toContain("Fixed");
    expect(explainViolation(noSl)).toContain("attached");

    const overRisk: ViolationLike = {
      type: "RISK_PER_TRADE_BREACH",
      details: { autoFixed: true, riskPercent: 2.4, cap: 1 },
    };
    expect(explainViolation(overRisk)).toContain("Fixed");
    expect(explainViolation(overRisk)).toContain("tightened");
    expect(explainViolation(overRisk)).toContain("2.40%");
  });
});

describe("violationAction", () => {
  it("prevention and repair override the close copy", () => {
    expect(
      violationAction({ type: "OUTSIDE_SESSION", details: { blockedPendingOrder: true } })
    ).toContain("cost nothing");
    expect(
      violationAction({ type: "RISK_PER_TRADE_BREACH", details: { autoFixed: true } })
    ).toContain("survived");
  });

  it("legacy rows keep the close-on-violation copy", () => {
    expect(violationAction({ type: "OUTSIDE_SESSION", details: {} })).toContain("closed the position");
    expect(violationAction({ type: "DAILY_LOSS_BREACH", details: null })).toContain("local midnight");
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

  it("standardized EA payload keys surface as figures", () => {
    const figures = violationFigures({
      type: "OUTSIDE_SESSION",
      details: { blockedPendingOrder: true, symbol: "EURUSD", volume: 0.5, orderTicket: "123456" },
    });
    expect(figures).toContainEqual({ label: "Symbol", value: "EURUSD" });
    expect(figures).toContainEqual({ label: "Lot size", value: "0.5" });
    expect(figures).toContainEqual({ label: "Order", value: "123456" });
    expect(figures).toContainEqual({ label: "Blocked before fill", value: "Yes" });
  });

  it("auto-fixed rows carry the flag figure", () => {
    const figures = violationFigures({
      type: "RISK_PER_TRADE_BREACH",
      details: { autoFixed: true, riskPercent: 2.4, cap: 1, symbol: "XAUUSD" },
    });
    expect(figures).toContainEqual({ label: "Auto-fixed", value: "Yes" });
    expect(figures).toContainEqual({ label: "Symbol", value: "XAUUSD" });
  });
});

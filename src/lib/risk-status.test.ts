import { describe, it, expect } from "vitest";
import { deriveStatus, deriveDayLock } from "@/lib/risk-status";

const base = {
  hasRules: true as boolean,
  dailyLossLimit: null as number | null,
  todayPnl: 0,
  maxTradesPerDay: null as number | null,
  todayTradeCount: 0,
};

describe("deriveStatus", () => {
  it("is not_configured before any rules exist", () => {
    expect(deriveStatus({ ...base, hasRules: false })).toBe("not_configured");
  });

  it("is safe when comfortably within limits", () => {
    expect(
      deriveStatus({ ...base, dailyLossLimit: 1000, todayPnl: -100, maxTradesPerDay: 10, todayTradeCount: 2 })
    ).toBe("safe");
  });

  it("warns at 70% of the daily loss limit", () => {
    expect(deriveStatus({ ...base, dailyLossLimit: 1000, todayPnl: -700 })).toBe("warning");
  });

  it("warns at 80% of the trade cap", () => {
    expect(deriveStatus({ ...base, maxTradesPerDay: 10, todayTradeCount: 8 })).toBe("warning");
  });

  it("locks when the daily loss limit is reached", () => {
    expect(deriveStatus({ ...base, dailyLossLimit: 500, todayPnl: -500 })).toBe("locked");
  });

  it("locks when the trade cap is reached", () => {
    expect(deriveStatus({ ...base, maxTradesPerDay: 5, todayTradeCount: 5 })).toBe("locked");
  });

  it("ignores profit when computing the loss ratio", () => {
    expect(deriveStatus({ ...base, dailyLossLimit: 500, todayPnl: 2000 })).toBe("safe");
  });
});

describe("deriveDayLock", () => {
  const midnight = "2026-09-25T00:00:00.000Z";
  const base = { rulesActive: true, lossBreachAt: null, todayTradeCount: 0, maxTradesPerDay: 3, nextMidnight: midnight };

  it("a daily-loss breach locks the rest of the day", () => {
    expect(deriveDayLock({ ...base, lossBreachAt: "2026-09-24T05:08:37Z" })).toEqual({
      reason: "daily_loss", since: "2026-09-24T05:08:37Z", endsAt: midnight,
    });
  });

  it("using every trade of the day locks it too, with no single moment", () => {
    expect(deriveDayLock({ ...base, todayTradeCount: 3 })).toEqual({ reason: "trade_cap", since: null, endsAt: midnight });
    expect(deriveDayLock({ ...base, todayTradeCount: 2 })).toBeNull();
  });

  it("the loss breach wins when both are true", () => {
    expect(deriveDayLock({ ...base, lossBreachAt: "x", todayTradeCount: 9 })?.reason).toBe("daily_loss");
  });

  it("paused rules are not enforced, so nothing is locked", () => {
    expect(deriveDayLock({ ...base, rulesActive: false, lossBreachAt: "x", todayTradeCount: 9 })).toBeNull();
  });

  it("no cap set means no cap lock", () => {
    expect(deriveDayLock({ ...base, maxTradesPerDay: null, todayTradeCount: 99 })).toBeNull();
  });
});

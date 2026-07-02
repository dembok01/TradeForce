import { describe, it, expect } from "vitest";
import { deriveStatus } from "@/lib/risk-status";

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

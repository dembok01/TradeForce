import { describe, it, expect } from "vitest";
import { summariseTrades } from "./journal-summary";
import type { Trade } from "@/lib/data/trades";

function trade(over: Partial<Trade>): Trade {
  return {
    id: crypto.randomUUID(),
    user_id: "u1",
    account_id: "a1",
    symbol: "EURUSD",
    direction: "LONG",
    entry_price: 1.1,
    exit_price: null,
    quantity: 1,
    pnl: null,
    entry_time: "2026-11-01T10:00:00.000Z",
    exit_time: null,
    notes: null,
    source: "EA",
    broker_deal_id: null,
    created_at: "2026-11-01T10:00:00.000Z",
    updated_at: "2026-11-01T10:00:00.000Z",
    ...over,
  };
}

describe("summariseTrades", () => {
  it("adds up wins, losses and the net result", () => {
    const s = summariseTrades([
      trade({ pnl: 100 }),
      trade({ pnl: 250 }),
      trade({ pnl: -75 }),
    ]);
    expect(s.total).toBe(3);
    expect(s.closed).toBe(3);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    expect(s.grossProfit).toBe(350);
    expect(s.grossLoss).toBe(75);
    expect(s.netPnl).toBe(275);
    expect(s.bestTrade).toBe(250);
    expect(s.worstTrade).toBe(-75);
  });

  it("counts a breakeven trade in the denominator but not as a win", () => {
    // Dropping pnl === 0 would report 100%, which is the kind of number an
    // operator might hand to a prop firm.
    const s = summariseTrades([trade({ pnl: 50 }), trade({ pnl: 0 })]);
    expect(s.breakeven).toBe(1);
    expect(s.wins).toBe(1);
    expect(s.closed).toBe(2);
    expect(s.winRatePercent).toBe(50);
  });

  it("treats a trade with no pnl as open, even if it has an exit price", () => {
    // A manually logged trade can carry an exit price with no result worked
    // out; counting it as closed invents a denominator.
    const s = summariseTrades([
      trade({ pnl: 100 }),
      trade({ exit_price: 1.2, exit_time: "2026-11-01T12:00:00.000Z", pnl: null }),
    ]);
    expect(s.closed).toBe(1);
    expect(s.open).toBe(1);
    expect(s.winRatePercent).toBe(100);
  });

  it("reports zero rather than NaN for an account that has closed nothing", () => {
    const s = summariseTrades([trade({}), trade({})]);
    expect(s.closed).toBe(0);
    expect(s.winRatePercent).toBe(0);
    expect(s.netPnl).toBe(0);
    expect(s.bestTrade).toBeNull();
    expect(s.worstTrade).toBeNull();
  });

  it("is empty-safe", () => {
    const s = summariseTrades([]);
    expect(s).toMatchObject({ total: 0, closed: 0, open: 0, winRatePercent: 0, netPnl: 0 });
    expect(s.symbols).toEqual([]);
    expect(s.firstEntry).toBeNull();
  });

  it("spans the date range and collects symbols regardless of row order", () => {
    const s = summariseTrades([
      trade({ symbol: "XAUUSD", entry_time: "2026-11-05T09:00:00.000Z" }),
      trade({ symbol: "EURUSD", entry_time: "2026-10-02T09:00:00.000Z" }),
      trade({ symbol: "EURUSD", entry_time: "2026-11-01T09:00:00.000Z" }),
    ]);
    expect(s.firstEntry).toBe("2026-10-02T09:00:00.000Z");
    expect(s.lastEntry).toBe("2026-11-05T09:00:00.000Z");
    expect(s.symbols).toEqual(["EURUSD", "XAUUSD"]);
  });
});

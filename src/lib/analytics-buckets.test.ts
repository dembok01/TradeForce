import { describe, expect, it } from "vitest";
import { shapeAnalytics, type PnlBucketRow } from "./analytics-buckets";

// A fixed "now" on the account's wall clock: Friday 2026-07-03, 15:00.
const wallNow = new Date(2026, 6, 3, 15, 0, 0);

const row = (kind: string, bucket_date: string, pnl: number, trades = 1, wins = 0): PnlBucketRow => ({
  kind,
  bucket_date,
  pnl,
  trade_count: trades,
  win_count: wins,
});

describe("shapeAnalytics", () => {
  it("returns all-zero fixed windows for no rows", () => {
    const shaped = shapeAnalytics([], wallNow);
    expect(shaped.dailyPnl).toHaveLength(7);
    expect(shaped.weeklyPnl).toHaveLength(8);
    expect(shaped.monthlyPnl).toHaveLength(6);
    expect(shaped.dailyPnl.every((b) => b.pnl === 0)).toBe(true);
    expect(shaped.winRatePercent).toBe(0);
    expect(shaped.tradesThisWeek).toBe(0);
    expect(shaped.tradesThisMonth).toBe(0);
  });

  it("places day buckets on the right local dates", () => {
    const shaped = shapeAnalytics(
      [row("day", "2026-07-03", 120), row("day", "2026-07-01", -45)],
      wallNow
    );
    // Last 7 days end on wallNow's date; index 6 = today, index 4 = July 1.
    expect(shaped.dailyPnl[6]).toEqual({ label: "Fri", pnl: 120 });
    expect(shaped.dailyPnl[4]).toEqual({ label: "Wed", pnl: -45 });
    expect(shaped.dailyPnl[5].pnl).toBe(0);
  });

  it("uses Sunday-start weeks matching date-fns startOfWeek", () => {
    // 2026-07-03 is a Friday; its date-fns week starts Sunday 2026-06-28.
    const shaped = shapeAnalytics([row("week", "2026-06-28", 300, 4, 2)], wallNow);
    expect(shaped.weeklyPnl[7].pnl).toBe(300);
    expect(shaped.tradesThisWeek).toBe(4);
  });

  it("derives win rate from month totals across the whole window", () => {
    const shaped = shapeAnalytics(
      [row("month", "2026-07-01", 500, 6, 3), row("month", "2026-05-01", -200, 4, 1)],
      wallNow
    );
    // 4 wins of 10 trades.
    expect(shaped.winRatePercent).toBeCloseTo(40);
    expect(shaped.tradesThisMonth).toBe(6);
    expect(shaped.monthlyPnl[5].pnl).toBe(500); // current month is the last bucket
    expect(shaped.monthlyPnl[3].pnl).toBe(-200); // May, two buckets back
  });

  it("coerces string numerics defensively", () => {
    const shaped = shapeAnalytics(
      [{ kind: "day", bucket_date: "2026-07-03", pnl: "42.5" as unknown as number, trade_count: 1, win_count: 1 }],
      wallNow
    );
    expect(shaped.dailyPnl[6].pnl).toBe(42.5);
  });
});

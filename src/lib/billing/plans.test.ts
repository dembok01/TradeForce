import { describe, expect, it } from "vitest";
import { PERIODS, periodFor, formatInr } from "./plans";

describe("periods", () => {
  it("offers one, three and twelve months", () => {
    expect(PERIODS.map((p) => p.months)).toEqual([1, 3, 12]);
  });

  // The longer periods are the only lever against the manual-approval cost, so
  // they have to actually be cheaper per month or nobody takes them.
  it("gets cheaper per month as the period lengthens", () => {
    const perMonth = PERIODS.map((p) => p.amountInr / p.months);
    expect(perMonth).toEqual([...perMonth].sort((a, b) => b - a));
    expect(new Set(perMonth).size).toBe(PERIODS.length);
  });

  it("prices every period in whole rupees", () => {
    for (const p of PERIODS) expect(Number.isInteger(p.amountInr)).toBe(true);
  });

  it("finds a period by its length and refuses one it does not sell", () => {
    expect(periodFor(3)?.amountInr).toBe(3399);
    expect(periodFor(6)).toBeUndefined();
    expect(periodFor(0)).toBeUndefined();
  });
});

describe("formatInr", () => {
  it("groups in the Indian system, not thousands", () => {
    expect(formatInr(1249)).toBe("₹1,249");
    expect(formatInr(11999)).toBe("₹11,999");
    expect(formatInr(1100000)).toBe("₹11,00,000");
  });
});

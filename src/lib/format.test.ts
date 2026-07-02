import { describe, it, expect } from "vitest";
import { formatCurrency, formatSignedCurrency, formatPercent } from "@/lib/format";

describe("formatCurrency", () => {
  it("formats USD with grouping and two decimals", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
  });
});

describe("formatSignedCurrency", () => {
  it("prefixes a plus for gains", () => expect(formatSignedCurrency(250)).toBe("+$250.00"));
  it("prefixes a minus for losses", () => expect(formatSignedCurrency(-250)).toBe("-$250.00"));
  it("leaves zero unsigned", () => expect(formatSignedCurrency(0)).toBe("$0.00"));
});

describe("formatPercent", () => {
  it("defaults to one decimal place", () => expect(formatPercent(66.666)).toBe("66.7%"));
  it("respects a custom precision", () => expect(formatPercent(66.666, 0)).toBe("67%"));
});

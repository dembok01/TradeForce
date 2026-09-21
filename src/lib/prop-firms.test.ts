import { describe, expect, it } from "vitest";
import { looksLikePropFirm } from "./prop-firms";

describe("looksLikePropFirm", () => {
  it("recognises prop firms however they are typed", () => {
    for (const t of ["FundedNext", "fundednext", "FundedNext-Server 3", "FTMO", "The5ers", "the 5ers",
                     "E8 Markets", "Maven Trading", "Alpha Capital", "Funded Trading Plus",
                     "mt5.fundedtradingplus.com:443", "FundingPips", "my prop firm", "FTMO-Demo"])
      expect(looksLikePropFirm(t), t).toBe(true);
  });

  it("leaves ordinary brokers alone", () => {
    for (const t of ["Equiti", "IC Markets", "Pepperstone", "Fusion Markets", "Alpari", "Exness",
                     "mt5-demo.alpari.com:443", "ICMarketsSC-Demo", "Forex.com", ""])
      expect(looksLikePropFirm(t), t).toBe(false);
  });

  it("checks every source it is given", () => {
    expect(looksLikePropFirm("IC Markets", null, "FTMO")).toBe(true);
    expect(looksLikePropFirm(undefined, null)).toBe(false);
  });
});

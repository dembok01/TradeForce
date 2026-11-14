import { describe, expect, it } from "vitest";
import { buildUpiUri, isVpa } from "./upi";

const PAYEE = { vpa: "tradeforce@okaxis", name: "TradeForce Technologies" };

describe("isVpa", () => {
  it.each(["a@okaxis", "trade.force-1@ybl", "9876543210@paytm"])("accepts %s", (v) => {
    expect(isVpa(v)).toBe(true);
  });

  it.each(["", "nohandle", "two@@at", "@bank", "name@", "has space@ybl"])("rejects %s", (v) => {
    expect(isVpa(v)).toBe(false);
  });
});

describe("buildUpiUri", () => {
  const uri = buildUpiUri({ ...PAYEE, amountInr: 1249, reference: "TF-7K3QD2" });
  const params = new URLSearchParams(uri.slice("upi://pay?".length));

  it("addresses the payee and names them", () => {
    expect(uri.startsWith("upi://pay?")).toBe(true);
    expect(params.get("pa")).toBe("tradeforce@okaxis");
    expect(params.get("pn")).toBe("TradeForce Technologies");
  });

  it("always carries the amount to exactly two decimals in INR", () => {
    expect(params.get("am")).toBe("1249.00");
    expect(params.get("cu")).toBe("INR");
  });

  // The note is what the payee actually sees next to the credit in GPay, and
  // `tr` is the merchant reference. Both carry it so whichever the app
  // surfaces, the operator can match the payment to a row.
  it("carries the reference as both the note and the transaction ref", () => {
    expect(params.get("tn")).toBe("TradeForce TF-7K3QD2");
    expect(params.get("tr")).toBe("TF-7K3QD2");
  });

  // URLSearchParams would encode a space as "+", which UPI apps do not decode.
  it("encodes spaces as %20, never +", () => {
    expect(uri).toContain("%20");
    expect(uri).not.toContain("+");
  });

  it("keeps paise", () => {
    const u = buildUpiUri({ ...PAYEE, amountInr: 1249.5, reference: "TF-1" });
    expect(new URLSearchParams(u.slice("upi://pay?".length)).get("am")).toBe("1249.50");
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1249.567])(
    "refuses an amount of %s rather than build a QR nobody can pay",
    (amountInr) => {
      expect(() => buildUpiUri({ ...PAYEE, amountInr, reference: "TF-1" })).toThrow();
    }
  );

  it("refuses a payee that is not a UPI handle", () => {
    expect(() => buildUpiUri({ vpa: "not-a-vpa", name: "X", amountInr: 1, reference: "R" })).toThrow();
  });

  it("refuses an empty reference, which would leave the operator nothing to match on", () => {
    expect(() => buildUpiUri({ ...PAYEE, amountInr: 1, reference: "  " })).toThrow();
  });
});

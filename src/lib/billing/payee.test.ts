import { describe, expect, it } from "vitest";
import { parsePayee } from "./payee";

const FULL = {
  UPI_VPA: "tradeforce@okaxis",
  UPI_PAYEE_NAME: "TradeForce Technologies",
  BANK_ACCOUNT_NAME: "TradeForce Technologies",
  BANK_ACCOUNT_NUMBER: "50100123456789",
  BANK_IFSC: "HDFC0000123",
  BANK_NAME: "HDFC Bank",
};

describe("parsePayee", () => {
  it("reads the UPI handle and the bank fallback", () => {
    const p = parsePayee(FULL);
    expect(p?.vpa).toBe("tradeforce@okaxis");
    expect(p?.name).toBe("TradeForce Technologies");
    expect(p?.bank).toEqual({
      accountName: "TradeForce Technologies",
      accountNumber: "50100123456789",
      ifsc: "HDFC0000123",
      bankName: "HDFC Bank",
    });
  });

  // A QR built on an empty or malformed payee scans to a payment nobody can
  // complete. The page has to be able to say "not configured" instead.
  it.each([
    ["no handle at all", { ...FULL, UPI_VPA: undefined }],
    ["an empty handle", { ...FULL, UPI_VPA: "   " }],
    ["a handle that is not a VPA", { ...FULL, UPI_VPA: "pay-me-please" }],
    ["no payee name", { ...FULL, UPI_PAYEE_NAME: undefined }],
  ])("returns nothing when there is %s", (_label, env) => {
    expect(parsePayee(env)).toBeNull();
  });

  // Bank transfer is the fallback, not the main route. A half-filled bank
  // block is worse than none: a trader who transfers to three correct fields
  // and one wrong one has lost the money, not failed a form.
  it("drops the bank block unless every field is present", () => {
    expect(parsePayee({ ...FULL, BANK_IFSC: undefined })?.bank).toBeNull();
    expect(parsePayee({ ...FULL, BANK_ACCOUNT_NUMBER: "" })?.bank).toBeNull();
  });

  it("still pays by UPI when no bank details are given at all", () => {
    const p = parsePayee({ UPI_VPA: FULL.UPI_VPA, UPI_PAYEE_NAME: FULL.UPI_PAYEE_NAME });
    expect(p?.vpa).toBe("tradeforce@okaxis");
    expect(p?.bank).toBeNull();
  });
});

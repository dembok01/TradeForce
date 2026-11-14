import { describe, expect, it } from "vitest";
import { entitlementFrom, extendedExpiry } from "./entitlement";

const NOW = new Date("2026-11-14T10:00:00.000Z");

describe("entitlementFrom", () => {
  it("is free when nothing has ever been bought", () => {
    expect(entitlementFrom(null, null, NOW)).toEqual({
      plan: "free",
      active: false,
      expiresAt: null,
      daysLeft: null,
    });
  });

  it("is active while the paid period runs", () => {
    const e = entitlementFrom("paid", "2026-12-14T10:00:00.000Z", NOW);
    expect(e.plan).toBe("paid");
    expect(e.active).toBe(true);
    expect(e.daysLeft).toBe(30);
  });

  // No scheduled job flips anyone back to free: a lapsed plan lapses because
  // the clock passed it, which is one less thing to run overnight.
  it("lapses on its own once the expiry is behind us", () => {
    const e = entitlementFrom("paid", "2026-11-13T10:00:00.000Z", NOW);
    expect(e.plan).toBe("paid");
    expect(e.active).toBe(false);
    expect(e.daysLeft).toBe(0);
  });

  it("counts a part-day as a day rather than rounding a trader out early", () => {
    expect(entitlementFrom("paid", "2026-11-14T23:59:00.000Z", NOW).daysLeft).toBe(1);
  });

  it("is not active on a paid plan with no expiry recorded", () => {
    expect(entitlementFrom("paid", null, NOW).active).toBe(false);
  });
});

describe("extendedExpiry", () => {
  it("runs from today for a trader who has never paid", () => {
    expect(extendedExpiry(null, 1, NOW).toISOString()).toBe("2026-12-14T10:00:00.000Z");
  });

  // Paying early must never cost the days already owned.
  it("stacks on top of a period still running", () => {
    const current = new Date("2026-12-14T10:00:00.000Z");
    expect(extendedExpiry(current, 3, NOW).toISOString()).toBe("2027-03-14T10:00:00.000Z");
  });

  it("runs from today when the old period is already dead, not from the dead date", () => {
    const current = new Date("2026-08-01T10:00:00.000Z");
    expect(extendedExpiry(current, 1, NOW).toISOString()).toBe("2026-12-14T10:00:00.000Z");
  });

  it("handles a month that has no 31st", () => {
    const current = new Date("2027-01-31T10:00:00.000Z");
    expect(extendedExpiry(current, 1, NOW).toISOString()).toBe("2027-02-28T10:00:00.000Z");
  });

  it("refuses a period that is not a positive whole number of months", () => {
    for (const months of [0, -1, 1.5, Number.NaN]) {
      expect(() => extendedExpiry(null, months, NOW)).toThrow();
    }
  });
});

import { describe, it, expect } from "vitest";
import {
  safeTimezone,
  zonedStartOfDay,
  zonedStartOfWeek,
  zonedStartOfMonth,
  zonedDateKey,
} from "@/lib/time-boundaries";

// 2026-07-03T22:00:00Z is already Saturday 2026-07-04 03:30 in IST — the exact
// case where server-clock (UTC) midnight puts a trade in the wrong "day".
const lateNightUtc = new Date("2026-07-03T22:00:00.000Z");

describe("zonedStartOfDay", () => {
  it("rolls the day over at IST midnight, not UTC midnight", () => {
    expect(zonedStartOfDay("Asia/Kolkata", lateNightUtc).toISOString()).toBe(
      "2026-07-03T18:30:00.000Z"
    );
  });

  it("matches plain UTC midnight for UTC accounts", () => {
    expect(zonedStartOfDay("UTC", lateNightUtc).toISOString()).toBe("2026-07-03T00:00:00.000Z");
  });

  it("handles New York (DST offset in July is -04:00)", () => {
    expect(zonedStartOfDay("America/New_York", lateNightUtc).toISOString()).toBe(
      "2026-07-03T04:00:00.000Z"
    );
  });
});

describe("zonedStartOfWeek", () => {
  it("finds the IST Sunday even when UTC is still on the previous week-day", () => {
    // In IST it's Saturday 2026-07-04; the week began Sunday 2026-06-28 00:00 IST.
    expect(zonedStartOfWeek("Asia/Kolkata", lateNightUtc).toISOString()).toBe(
      "2026-06-27T18:30:00.000Z"
    );
  });
});

describe("zonedStartOfMonth", () => {
  it("returns the zone's first-of-month midnight as a UTC instant", () => {
    expect(zonedStartOfMonth("Asia/Kolkata", lateNightUtc).toISOString()).toBe(
      "2026-06-30T18:30:00.000Z"
    );
  });
});

describe("zonedDateKey", () => {
  it("keys the score row to the trader's calendar date", () => {
    expect(zonedDateKey("Asia/Kolkata", lateNightUtc)).toBe("2026-07-04");
    expect(zonedDateKey("UTC", lateNightUtc)).toBe("2026-07-03");
  });
});

describe("safeTimezone", () => {
  it("falls back to UTC for null, blank, and garbage values", () => {
    expect(safeTimezone(null)).toBe("UTC");
    expect(safeTimezone("")).toBe("UTC");
    expect(safeTimezone("Not/AZone")).toBe("UTC");
    expect(safeTimezone("Asia/Kolkata")).toBe("Asia/Kolkata");
  });
});

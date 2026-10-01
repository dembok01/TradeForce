import { describe, it, expect } from "vitest";
import {
  isWithinUtcWindow,
  isCustomWindowActive,
  nextSessionEdge,
  parseTimeToUtcHours,
  localTimeToUtc,
  utcTimeToLocal,
  formatWindowLocal,
  timezoneOptions,
} from "@/lib/trading-sessions";

// Fixed UTC instants so these never depend on the wall clock.
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 0, 1, h, m));

describe("isWithinUtcWindow", () => {
  it("is inside a normal daytime window", () => {
    expect(isWithinUtcWindow(8, 16.5, at(12))).toBe(true);
  });

  it("includes the start and excludes the end", () => {
    expect(isWithinUtcWindow(8, 16.5, at(8))).toBe(true);
    expect(isWithinUtcWindow(8, 16.5, at(16, 30))).toBe(false);
  });

  it("handles a window that wraps past midnight UTC", () => {
    expect(isWithinUtcWindow(22, 6, at(23))).toBe(true);
    expect(isWithinUtcWindow(22, 6, at(3))).toBe(true);
    expect(isWithinUtcWindow(22, 6, at(12))).toBe(false);
  });
});

describe("isCustomWindowActive", () => {
  it("is inactive when either bound is missing", () => {
    expect(isCustomWindowActive(null, "16:00", at(12))).toBe(false);
    expect(isCustomWindowActive("08:00", null, at(12))).toBe(false);
  });

  it("parses HH:mm bounds", () => {
    expect(isCustomWindowActive("08:30", "16:30", at(9))).toBe(true);
    expect(isCustomWindowActive("08:30", "16:30", at(8))).toBe(false);
  });
});

describe("nextSessionEdge", () => {
  const london = { label: "London", startUtc: 8, endUtc: 16.5 };
  const newYork = { label: "New York", startUtc: 13, endUtc: 22 };

  it("returns the soonest close while a session is active", () => {
    expect(nextSessionEdge([london, newYork], at(14))).toEqual({
      label: "London",
      kind: "closes",
      minutes: 150,
    });
  });

  it("returns the soonest open when nothing is active", () => {
    expect(nextSessionEdge([london], at(6))).toEqual({
      label: "London",
      kind: "opens",
      minutes: 120,
    });
  });

  it("wraps past midnight for tomorrow's open", () => {
    expect(nextSessionEdge([london], at(23))).toEqual({
      label: "London",
      kind: "opens",
      minutes: 540,
    });
  });

  it("returns null with no windows", () => {
    expect(nextSessionEdge([], at(12))).toBeNull();
  });
});

describe("parseTimeToUtcHours", () => {
  it("parses HH:MM and HH:MM:SS", () => {
    expect(parseTimeToUtcHours("08:30")).toBe(8.5);
    expect(parseTimeToUtcHours("13:45:00")).toBe(13.75);
  });
});

describe("custom window on the trader's clock", () => {
  const jan = at(12);
  const jul = new Date(Date.UTC(2026, 6, 1, 12));

  it("converts IST to the UTC the EA enforces, and back", () => {
    // The reported bug: 09:00-15:30 typed by an IST trader was enforced as UTC.
    expect(localTimeToUtc("09:00", "Asia/Kolkata", jan)).toBe("03:30");
    expect(localTimeToUtc("15:30", "Asia/Kolkata", jan)).toBe("10:00");
    expect(utcTimeToLocal("03:30:00", "Asia/Kolkata", jan)).toBe("09:00");
  });

  it("wraps across midnight in both directions", () => {
    expect(localTimeToUtc("02:00", "Asia/Kolkata", jan)).toBe("20:30");
    expect(utcTimeToLocal("22:00", "Asia/Kolkata", jan)).toBe("03:30");
    expect(localTimeToUtc("21:00", "America/New_York", jan)).toBe("02:00");
  });

  it("uses the offset in force at the time (DST)", () => {
    expect(localTimeToUtc("09:30", "America/New_York", jan)).toBe("14:30");
    expect(localTimeToUtc("09:30", "America/New_York", jul)).toBe("13:30");
  });

  it("labels preset windows in the trader's zone", () => {
    expect(formatWindowLocal(8, 16.5, "Asia/Kolkata", jan)).toBe("13:30–22:00 IST");
    expect(formatWindowLocal(8, 16.5, "UTC", jan)).toBe("08:00–16:30 UTC");
  });

  it("lists every zone once, the launch three first, IST by its current name", () => {
    const values = timezoneOptions(undefined, jan).map((o) => o.value);
    expect(values.slice(0, 3)).toEqual(["Asia/Kolkata", "UTC", "America/New_York"]);
    expect(values).not.toContain("Asia/Calcutta");
    expect(new Set(values).size).toBe(values.length);
    expect(values.length).toBeGreaterThan(300);
    expect(timezoneOptions("Etc/GMT-4", jan)[0].value).toBe("Etc/GMT-4");
  });
});

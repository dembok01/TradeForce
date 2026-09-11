import { describe, it, expect } from "vitest";
import { uptimePctFromGaps, desktopHealth, eaHealth } from "./ops-health";

const NOW = Date.parse("2026-08-29T12:00:00Z");
const WEEK = 7 * 86400_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("uptimePctFromGaps", () => {
  it("is 100% with no gaps", () => {
    expect(uptimePctFromGaps([], WEEK, NOW)).toBe(100);
  });

  it("counts a gap inside the window", () => {
    // 1 day down out of 7 => 6/7 = 85.71%
    const g = [{ started_at: ago(2 * 86400_000), ended_at: ago(86400_000) }];
    expect(uptimePctFromGaps(g, WEEK, NOW)).toBeCloseTo(85.71, 1);
  });

  it("clips a gap that began before the window", () => {
    // 48h freeze starting 8 days ago, ending 6 days ago: only 1 day is inside.
    const g = [{ started_at: ago(8 * 86400_000), ended_at: ago(6 * 86400_000) }];
    expect(uptimePctFromGaps(g, WEEK, NOW)).toBeCloseTo(85.71, 1);
  });

  it("never goes negative when gaps exceed the window", () => {
    const g = [{ started_at: ago(60 * 86400_000), ended_at: ago(0) }];
    expect(uptimePctFromGaps(g, WEEK, NOW)).toBe(0);
  });

  it("ignores a gap entirely outside the window", () => {
    const g = [{ started_at: ago(30 * 86400_000), ended_at: ago(29 * 86400_000) }];
    expect(uptimePctFromGaps(g, WEEK, NOW)).toBe(100);
  });
});

describe("desktopHealth", () => {
  it("is idle when the EA has never reported", () => {
    expect(desktopHealth(null)).toBe("idle");
  });
  it("tolerates an overnight terminal", () => {
    expect(desktopHealth(new Date(Date.now() - 30 * 60_000).toISOString())).toBe("ok");
  });
  it("warns after an hour, not five minutes", () => {
    expect(desktopHealth(new Date(Date.now() - 3 * 3600_000).toISOString())).toBe("warn");
  });
  it("is down after a day — this is the 37-day case we were blind to", () => {
    expect(desktopHealth(new Date(Date.now() - 37 * 86400_000).toISOString())).toBe("down");
  });
});

describe("eaHealth", () => {
  it("is idle when we never asked it to run", () => {
    expect(eaHealth(null, "stopped")).toBe("idle");
  });
  it("is down when marked running but never seen", () => {
    expect(eaHealth(null, "running")).toBe("down");
  });
  it("is down on a cloud instance silent past the dead threshold", () => {
    expect(eaHealth(new Date(Date.now() - 20 * 60_000).toISOString(), "running")).toBe("down");
  });
});

import { describe, it, expect } from "vitest";
import { isWithinUtcWindow, isCustomWindowActive } from "@/lib/trading-sessions";

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

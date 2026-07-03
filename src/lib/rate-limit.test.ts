import { describe, it, expect } from "vitest";
import { createRateLimiter } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit within a window, then rejects", () => {
    const check = createRateLimiter({ limit: 3, windowMs: 60_000 });
    const t = 1_000_000;
    expect(check("k", t)).toBe(true);
    expect(check("k", t + 1)).toBe(true);
    expect(check("k", t + 2)).toBe(true);
    expect(check("k", t + 3)).toBe(false);
  });

  it("resets when the window rolls over", () => {
    const check = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const t = 1_000_000;
    expect(check("k", t)).toBe(true);
    expect(check("k", t + 1)).toBe(false);
    expect(check("k", t + 60_000)).toBe(true);
  });

  it("tracks keys independently", () => {
    const check = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const t = 1_000_000;
    expect(check("a", t)).toBe(true);
    expect(check("b", t)).toBe(true);
    expect(check("a", t + 1)).toBe(false);
  });
});

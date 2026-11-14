import { describe, expect, it } from "vitest";
import { newReference } from "./reference";

describe("newReference", () => {
  it("is a short TF- code a human can read off a bank statement", () => {
    expect(newReference()).toMatch(/^TF-[A-Z0-9]{6}$/);
  });

  // The operator reads these back from GPay and types them into the console.
  // 0/O and 1/I are the pair that gets mistyped, so they are not in the set.
  it("avoids characters that are read wrong", () => {
    const codes = Array.from({ length: 400 }, () => newReference()).join("");
    expect(codes).not.toMatch(/[01OI]/);
  });

  it("does not repeat in any practical run", () => {
    const seen = new Set(Array.from({ length: 2000 }, () => newReference()));
    expect(seen.size).toBe(2000);
  });
});

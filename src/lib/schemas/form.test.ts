import { describe, it, expect } from "vitest";
import { z } from "zod";
import { fieldErrorsFrom, optionalNumber, requiredNumber } from "@/lib/schemas/form";

describe("optionalNumber", () => {
  const schema = optionalNumber("Out of range.", { min: 0, max: 100 });

  it("maps blank to null", () => {
    expect(schema.parse("")).toBeNull();
    expect(schema.parse("   ")).toBeNull();
  });

  it("trims and parses numbers", () => {
    expect(schema.parse(" 42 ")).toBe(42);
    expect(schema.parse("0.5")).toBe(0.5);
  });

  it("rejects non-numeric input", () => {
    expect(schema.safeParse("abc").success).toBe(false);
  });

  it("enforces bounds", () => {
    expect(schema.safeParse("-1").success).toBe(false);
    expect(schema.safeParse("101").success).toBe(false);
    expect(schema.safeParse("100").success).toBe(true);
  });
});

describe("requiredNumber", () => {
  const schema = requiredNumber("Required.", { min: 1 });

  it("rejects blank input", () => {
    expect(schema.safeParse("").success).toBe(false);
    expect(schema.safeParse("   ").success).toBe(false);
  });

  it("parses valid numbers", () => {
    expect(schema.parse("5")).toBe(5);
  });

  it("enforces bounds", () => {
    expect(schema.safeParse("0").success).toBe(false);
    expect(schema.safeParse("1").success).toBe(true);
  });

  it("works without bounds (backward compatible)", () => {
    expect(requiredNumber("Required.").parse("-3")).toBe(-3);
  });
});

describe("fieldErrorsFrom", () => {
  it("keeps the first message per field", () => {
    const schema = z.object({
      a: z.string().min(2, "first").regex(/x/, "second"),
    });
    const result = schema.safeParse({ a: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrorsFrom(result.error)).toEqual({ a: "first" });
    }
  });

  it("keys issues without a path under 'form'", () => {
    const schema = z
      .object({ a: z.string(), b: z.string() })
      .refine(() => false, { message: "whole-object failure" });
    const result = schema.safeParse({ a: "x", b: "y" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrorsFrom(result.error)).toEqual({ form: "whole-object failure" });
    }
  });
});

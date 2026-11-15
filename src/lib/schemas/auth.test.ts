import { describe, it, expect } from "vitest";
import { signUpSchema, phoneField } from "./auth";

const valid = {
  fullName: "Ravi Kumar",
  phone: "+919876543210",
  email: "ravi@example.com",
  password: "a-good-password",
  confirmPassword: "a-good-password",
  terms: "on",
};

function errorOn(input: Record<string, unknown>, field: string): string | undefined {
  const r = signUpSchema.safeParse(input);
  if (r.success) return undefined;
  return r.error.issues.find((i) => i.path[0] === field)?.message;
}

describe("signUpSchema", () => {
  it("accepts a complete signup", () => {
    const r = signUpSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("refuses a signup where the passwords differ, against the field they fix", () => {
    expect(errorOn({ ...valid, confirmPassword: "something-else" }, "confirmPassword")).toBe(
      "Both passwords need to match."
    );
  });

  // A checkbox is simply absent from FormData when it is not ticked, which is
  // why the action passes "" rather than false.
  it("refuses a signup with the terms box unticked", () => {
    expect(errorOn({ ...valid, terms: "" }, "terms")).toMatch(/accept the terms/i);
    expect(errorOn({ ...valid, terms: undefined }, "terms")).toMatch(/accept the terms/i);
  });

  it("refuses a name that is only punctuation or digits", () => {
    expect(errorOn({ ...valid, fullName: "..." }, "fullName")).toBeTruthy();
    expect(errorOn({ ...valid, fullName: "12345" }, "fullName")).toBeTruthy();
  });

  it("accepts names this codebase would never have enumerated", () => {
    for (const fullName of ["Ravi O'Brien-Kumar", "José Álvarez", "അമൽ മനോജ്", "李雷"]) {
      expect(signUpSchema.safeParse({ ...valid, fullName }).success).toBe(true);
    }
  });

  it("refuses a password under 8 characters", () => {
    expect(errorOn({ ...valid, password: "short", confirmPassword: "short" }, "password")).toMatch(
      /8 characters/
    );
  });

  it("hands back the trimmed, normalised values", () => {
    const r = signUpSchema.safeParse({
      ...valid,
      fullName: "  Ravi Kumar  ",
      phone: "+91 98765-43210",
      email: "  RAVI@example.com  ",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.fullName).toBe("Ravi Kumar");
      expect(r.data.phone).toBe("+919876543210");
    }
  });
});

describe("phoneField", () => {
  it("strips the separators people actually type", () => {
    for (const typed of ["+91 98765 43210", "+91-98765-43210", "(091) 98765.43210"]) {
      const r = phoneField.safeParse(typed);
      expect(r.success, typed).toBe(true);
      if (r.success) expect(r.data).not.toMatch(/[\s().-]/);
    }
  });

  it("accepts a bare Indian ten-digit number", () => {
    expect(phoneField.safeParse("9876543210").success).toBe(true);
  });

  it("refuses something nobody could dial", () => {
    for (const bad of ["", "12345", "not a phone", "+91 98765 4321012345678"]) {
      expect(phoneField.safeParse(bad).success, bad).toBe(false);
    }
  });
});

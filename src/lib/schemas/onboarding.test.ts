import { describe, it, expect } from "vitest";
import {
  EXPERIENCE_LEVELS,
  MARKET_OPTIONS,
  ONBOARDING_STEP_SCHEMAS,
  onboardingSchema,
} from "@/lib/schemas/onboarding";

const validInput = {
  full_name: " Alex Trader ",
  experience_level: "funded",
  markets_traded: ["forex", "indices"],
  prop_firm: "",
  daily_loss_limit: "500",
  risk_per_trade_percent: "1",
  max_trades_per_day: "5",
  max_open_positions: "",
  session_london_enabled: true,
  session_new_york_enabled: false,
  session_asian_enabled: false,
  session_london_ny_overlap_enabled: true,
  timezone: "UTC",
};

describe("onboardingSchema", () => {
  it("parses a complete wizard payload into typed rule values", () => {
    const out = onboardingSchema.parse(validInput);
    expect(out.full_name).toBe("Alex Trader");
    expect(out.prop_firm).toBeNull();
    expect(out.daily_loss_limit).toBe(500);
    expect(out.risk_per_trade_percent).toBe(1);
    expect(out.max_trades_per_day).toBe(5);
    expect(out.max_open_positions).toBeNull();
  });

  it("requires at least one market", () => {
    expect(onboardingSchema.safeParse({ ...validInput, markets_traded: [] }).success).toBe(false);
  });

  it("rejects unknown experience levels and markets", () => {
    expect(
      onboardingSchema.safeParse({ ...validInput, experience_level: "guru" }).success
    ).toBe(false);
    expect(
      onboardingSchema.safeParse({ ...validInput, markets_traded: ["forex", "beanie-babies"] })
        .success
    ).toBe(false);
  });

  it("requires the core risk numbers", () => {
    expect(onboardingSchema.safeParse({ ...validInput, daily_loss_limit: "" }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...validInput, daily_loss_limit: "0" }).success).toBe(
      false
    );
    expect(
      onboardingSchema.safeParse({ ...validInput, risk_per_trade_percent: "101" }).success
    ).toBe(false);
    expect(onboardingSchema.safeParse({ ...validInput, max_trades_per_day: "0" }).success).toBe(
      false
    );
  });

  it("rejects fractional trade caps and typo-scale limits", () => {
    expect(onboardingSchema.safeParse({ ...validInput, max_trades_per_day: "5.5" }).success).toBe(
      false
    );
    expect(
      onboardingSchema.safeParse({ ...validInput, daily_loss_limit: "50000000" }).success
    ).toBe(false);
  });
});

describe("onboarding step schemas", () => {
  it("cover every schema field exactly once", () => {
    const stepFields = Object.values(ONBOARDING_STEP_SCHEMAS).flatMap((schema) =>
      Object.keys(schema.shape)
    );
    const allFields = Object.keys(onboardingSchema.shape);
    expect(new Set(stepFields).size).toBe(stepFields.length);
    expect([...stepFields].sort()).toEqual([...allFields].sort());
  });

  it("validate against the same rules as the full schema", () => {
    const risk = ONBOARDING_STEP_SCHEMAS.risk.safeParse({
      daily_loss_limit: "",
      risk_per_trade_percent: "1",
    });
    expect(risk.success).toBe(false);
  });

  it("keeps the enum vocabulary in sync with the option lists", () => {
    expect(onboardingSchema.shape.experience_level.options).toEqual(
      EXPERIENCE_LEVELS.map((e) => e.value)
    );
    expect(onboardingSchema.shape.markets_traded.element.options).toEqual(
      MARKET_OPTIONS.map((m) => m.value)
    );
  });
});

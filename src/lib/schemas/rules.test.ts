import { describe, it, expect } from "vitest";
import { ruleSettingsSchema, sessionConfigSchema } from "@/lib/schemas/rules";

const blankRules = {
  daily_loss_limit: "",
  max_trades_per_day: "",
  max_open_positions: "",
  risk_per_trade_percent: "",
  is_active: null as unknown,
};

describe("ruleSettingsSchema", () => {
  it("treats a Radix Switch 'on' as true and absence as false", () => {
    expect(ruleSettingsSchema.parse({ ...blankRules, is_active: "on" }).is_active).toBe(true);
    expect(ruleSettingsSchema.parse(blankRules).is_active).toBe(false);
  });

  it("allows all limits to be left blank", () => {
    const parsed = ruleSettingsSchema.parse(blankRules);
    expect(parsed.daily_loss_limit).toBeNull();
    expect(parsed.max_trades_per_day).toBeNull();
  });

  it("bounds risk per trade to 100%", () => {
    expect(
      ruleSettingsSchema.safeParse({ ...blankRules, risk_per_trade_percent: "150" }).success
    ).toBe(false);
  });

  it("rejects negative limits", () => {
    expect(ruleSettingsSchema.safeParse({ ...blankRules, daily_loss_limit: "-5" }).success).toBe(
      false
    );
  });
});

const blankSessions = {
  session_london_enabled: null as unknown,
  session_new_york_enabled: null as unknown,
  session_asian_enabled: null as unknown,
  session_london_ny_overlap_enabled: null as unknown,
  custom_session_start: "",
  custom_session_end: "",
  timezone: "UTC",
};

describe("sessionConfigSchema", () => {
  it("requires both custom times or neither", () => {
    expect(
      sessionConfigSchema.safeParse({ ...blankSessions, custom_session_start: "09:00" }).success
    ).toBe(false);
    expect(sessionConfigSchema.safeParse(blankSessions).success).toBe(true);
    expect(
      sessionConfigSchema.safeParse({
        ...blankSessions,
        custom_session_start: "09:00",
        custom_session_end: "17:00",
      }).success
    ).toBe(true);
  });

  it("maps blank custom times to null", () => {
    const parsed = sessionConfigSchema.parse(blankSessions);
    expect(parsed.custom_session_start).toBeNull();
    expect(parsed.custom_session_end).toBeNull();
  });

  it("falls back to UTC for a blank timezone", () => {
    expect(sessionConfigSchema.parse({ ...blankSessions, timezone: "" }).timezone).toBe("UTC");
  });
});

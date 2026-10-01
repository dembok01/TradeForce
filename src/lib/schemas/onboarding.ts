import { z } from "zod";
import { optionalNumber } from "@/lib/schemas/form";
import { RULE_BOUNDS, customWindowError, customWindowOk, timeOrBlank, timezoneField } from "@/lib/schemas/rules";

// Option lists live here (not in the wizard) so the zod enums and the UI can
// never drift apart. Client-safe: no server-only imports.

export const EXPERIENCE_LEVELS = [
  { value: "first_evaluation", label: "On my first evaluation", hint: "Working toward a funded account" },
  { value: "funded", label: "Trading a funded account", hint: "Passed — now protecting it" },
  { value: "multiple_firms", label: "Funded with multiple firms", hint: "Managing several accounts" },
  { value: "exploring", label: "Still exploring", hint: "Comparing prop firms" },
] as const;

export const MARKET_OPTIONS = [
  { value: "forex", label: "Forex" },
  { value: "futures", label: "Futures" },
  { value: "indices", label: "Indices" },
  { value: "metals", label: "Metals" },
  { value: "crypto", label: "Crypto" },
  { value: "stocks", label: "Stocks" },
] as const;

const experienceEnum = z.enum(
  EXPERIENCE_LEVELS.map((e) => e.value) as [string, ...string[]]
);
const marketEnum = z.enum(MARKET_OPTIONS.map((m) => m.value) as [string, ...string[]]);

const optionalText = z
  .string()
  .trim()
  .max(120, "Keep it under 120 characters.")
  .transform((v) => (v === "" ? null : v));

// Numeric inputs arrive as strings from controlled inputs (same convention as
// the FormData forms), so the form.ts helpers apply unchanged.
// Every limit is optional: a trader may only want a session window, or only a
// loss limit. The action activates the charter only if something is set.
const onboardingFields = z.object({
  full_name: optionalText,
  experience_level: experienceEnum,
  markets_traded: z.array(marketEnum).min(1, "Pick at least one market."),
  prop_firm: optionalText,

  daily_loss_limit: optionalNumber("Daily loss limit must be between $0.01 and $10,000,000.", {
    min: 0.01,
    max: RULE_BOUNDS.dailyLossLimitMax,
  }),
  risk_per_trade_percent: optionalNumber("Risk per trade must be between 0.01 and 100%.", {
    min: 0.01,
    max: 100,
  }),

  max_trades_per_day: optionalNumber("Daily trade cap must be between 1 and 500.", {
    min: 1,
    max: RULE_BOUNDS.maxTradesPerDayMax,
    int: true,
  }),
  max_open_positions: optionalNumber("Max open positions must be between 0 and 100.", {
    min: 0,
    max: RULE_BOUNDS.maxOpenPositionsMax,
    int: true,
  }),

  session_london_enabled: z.boolean(),
  session_new_york_enabled: z.boolean(),
  session_asian_enabled: z.boolean(),
  session_london_ny_overlap_enabled: z.boolean(),
  // "HH:MM" on the trader's own clock; the action converts to stored UTC.
  custom_session_start: timeOrBlank,
  custom_session_end: timeOrBlank,
  timezone: timezoneField,
});

export const onboardingSchema = onboardingFields.refine(customWindowOk, customWindowError);

export type OnboardingInput = z.input<typeof onboardingSchema>;
export type OnboardingValues = z.output<typeof onboardingSchema>;

// The Settings page's Profile card edits the same four "about you" fields the
// wizard collects — one schema so they can't drift.
export const profileDetailsSchema = onboardingFields.pick({
  full_name: true,
  experience_level: true,
  markets_traded: true,
  prop_firm: true,
});

// Per-step validation uses the exact same source of truth as the final parse.
// (zod refuses .pick() on a refined object, hence onboardingFields.)
export const ONBOARDING_STEP_SCHEMAS = {
  about: onboardingFields.pick({
    full_name: true,
    experience_level: true,
    markets_traded: true,
    prop_firm: true,
  }),
  risk: onboardingFields.pick({ daily_loss_limit: true, risk_per_trade_percent: true }),
  pace: onboardingFields.pick({ max_trades_per_day: true, max_open_positions: true }),
  sessions: onboardingFields
    .pick({
      session_london_enabled: true,
      session_new_york_enabled: true,
      session_asian_enabled: true,
      session_london_ny_overlap_enabled: true,
      custom_session_start: true,
      custom_session_end: true,
      timezone: true,
    })
    .refine(customWindowOk, customWindowError),
} as const;

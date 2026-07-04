import { z } from "zod";
import { optionalNumber, requiredNumber } from "@/lib/schemas/form";
import { RULE_BOUNDS } from "@/lib/schemas/rules";

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
export const onboardingSchema = z.object({
  full_name: optionalText,
  experience_level: experienceEnum,
  markets_traded: z.array(marketEnum).min(1, "Pick at least one market."),
  prop_firm: optionalText,

  daily_loss_limit: requiredNumber("Enter a daily loss limit between $0 and $10,000,000.", {
    min: 0.01,
    max: RULE_BOUNDS.dailyLossLimitMax,
  }),
  risk_per_trade_percent: requiredNumber("Risk per trade must be between 0 and 100%.", {
    min: 0.01,
    max: 100,
  }),

  max_trades_per_day: requiredNumber("Enter a daily trade cap between 1 and 500.", {
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
  timezone: z.string().trim().min(1).catch("UTC"),
});

export type OnboardingInput = z.input<typeof onboardingSchema>;
export type OnboardingValues = z.output<typeof onboardingSchema>;

// The Settings page's Profile card edits the same four "about you" fields the
// wizard collects — one schema so they can't drift.
export const profileDetailsSchema = onboardingSchema.pick({
  full_name: true,
  experience_level: true,
  markets_traded: true,
  prop_firm: true,
});

// Per-step validation uses the exact same source of truth as the final parse.
export const ONBOARDING_STEP_SCHEMAS = {
  about: onboardingSchema.pick({
    full_name: true,
    experience_level: true,
    markets_traded: true,
    prop_firm: true,
  }),
  risk: onboardingSchema.pick({ daily_loss_limit: true, risk_per_trade_percent: true }),
  pace: onboardingSchema.pick({ max_trades_per_day: true, max_open_positions: true }),
  sessions: onboardingSchema.pick({
    session_london_enabled: true,
    session_new_york_enabled: true,
    session_asian_enabled: true,
    session_london_ny_overlap_enabled: true,
    timezone: true,
  }),
} as const;

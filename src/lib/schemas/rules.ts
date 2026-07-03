import { z } from "zod";
import { optionalNumber } from "@/lib/schemas/form";

// A Radix Switch submits "on" when checked and nothing when off.
const checkbox = z.preprocess((v) => v === "on", z.boolean());
const timeOrBlank = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v));

// Upper bounds are sanity rails against typos (an extra zero on a loss limit),
// not judgments about trading style. Keep in sync with onboarding.ts.
export const RULE_BOUNDS = {
  dailyLossLimitMax: 10_000_000,
  maxTradesPerDayMax: 500,
  maxOpenPositionsMax: 100,
} as const;

export const ruleSettingsSchema = z.object({
  daily_loss_limit: optionalNumber("Daily loss limit must be between $0 and $10,000,000.", {
    min: 0,
    max: RULE_BOUNDS.dailyLossLimitMax,
  }),
  max_trades_per_day: optionalNumber("Max trades per day must be between 0 and 500.", {
    min: 0,
    max: RULE_BOUNDS.maxTradesPerDayMax,
    int: true,
  }),
  max_open_positions: optionalNumber("Max open positions must be between 0 and 100.", {
    min: 0,
    max: RULE_BOUNDS.maxOpenPositionsMax,
    int: true,
  }),
  risk_per_trade_percent: optionalNumber("Risk per trade must be between 0 and 100%.", {
    min: 0,
    max: 100,
  }),
  is_active: checkbox,
});

export const sessionConfigSchema = z
  .object({
    session_london_enabled: checkbox,
    session_new_york_enabled: checkbox,
    session_asian_enabled: checkbox,
    session_london_ny_overlap_enabled: checkbox,
    custom_session_start: timeOrBlank,
    custom_session_end: timeOrBlank,
    timezone: z.string().trim().min(1).catch("UTC"),
  })
  .refine((d) => Boolean(d.custom_session_start) === Boolean(d.custom_session_end), {
    message: "Set both a start and end time, or leave both blank.",
    path: ["custom_session_end"],
  });

export type RuleSettingsValues = z.output<typeof ruleSettingsSchema>;
export type SessionConfigValues = z.output<typeof sessionConfigSchema>;

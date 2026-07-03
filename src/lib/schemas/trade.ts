import { z } from "zod";
import { optionalNumber, requiredNumber } from "@/lib/schemas/form";

export const TRADE_DIRECTIONS = ["LONG", "SHORT"] as const;
export type TradeDirectionValue = (typeof TRADE_DIRECTIONS)[number];

const parseableDatetime = (message: string) =>
  z
    .string()
    .trim()
    .min(1, message)
    .refine((v) => Number.isFinite(Date.parse(v)), message);

// Both parsers for "a trade" live in this one file so the manual dialog and
// the EA ingestion route can't drift apart on constraints.

// Manual Log-trade dialog: raw FormData strings.
export const tradeFormSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1, "Symbol is required.")
    .transform((s) => s.toUpperCase()),
  direction: z
    .string()
    .refine((v): v is TradeDirectionValue => TRADE_DIRECTIONS.includes(v as TradeDirectionValue), "Pick a direction.")
    .transform((v) => v as TradeDirectionValue),
  entry_price: requiredNumber("Entry price is required."),
  exit_price: optionalNumber("Enter a valid exit price."),
  quantity: optionalNumber("Quantity can't be negative.", { min: 0 }),
  pnl: optionalNumber("Enter a valid P/L."),
  entry_time: parseableDatetime("Enter a valid entry date & time."),
  notes: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v)),
});

export type TradeFormValues = z.output<typeof tradeFormSchema>;

// EA report (POST /api/ea/trades): JSON numbers, camelCase keys.
export const eaTradeReportSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1)
    .transform((s) => s.toUpperCase()),
  direction: z.enum(TRADE_DIRECTIONS),
  entryPrice: z.number().finite(),
  exitPrice: z.number().finite().nullable().optional(),
  quantity: z.number().finite().min(0).nullable().optional(),
  pnl: z.number().finite().nullable().optional(),
  entryTime: parseableDatetime("Invalid entryTime."),
  exitTime: parseableDatetime("Invalid exitTime.").nullable().optional(),
});

export type EaTradeReport = z.output<typeof eaTradeReportSchema>;

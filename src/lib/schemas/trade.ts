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

// Sanity ceilings for EA-reported numbers. The service-role write path
// bypasses RLS, and the DB columns are numeric(18,6)/numeric(14,x) — an
// unbounded value from a bugged EA would hit "numeric field overflow" (500)
// or silently corrupt analytics. A prop account never legitimately nears these.
export const EA_REPORT_BOUNDS = {
  priceMax: 1e9,
  quantityMax: 1e9,
  pnlAbsMax: 1e9,
} as const;

// EA report (POST /api/ea/trades): JSON numbers, camelCase keys.
export const eaTradeReportSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .transform((s) => s.toUpperCase()),
  direction: z.enum(TRADE_DIRECTIONS),
  entryPrice: z.number().finite().positive().max(EA_REPORT_BOUNDS.priceMax),
  exitPrice: z.number().finite().positive().max(EA_REPORT_BOUNDS.priceMax).nullable().optional(),
  quantity: z.number().finite().min(0).max(EA_REPORT_BOUNDS.quantityMax).nullable().optional(),
  pnl: z
    .number()
    .finite()
    .min(-EA_REPORT_BOUNDS.pnlAbsMax)
    .max(EA_REPORT_BOUNDS.pnlAbsMax)
    .nullable()
    .optional(),
  entryTime: parseableDatetime("Invalid entryTime."),
  exitTime: parseableDatetime("Invalid exitTime.").nullable().optional(),
  // Broker deal/ticket id. When present, (account, brokerDealId) is the
  // idempotency key — the EA's retry queue can safely re-POST after a timeout.
  brokerDealId: z.string().trim().min(1).max(64).optional(),
});

export type EaTradeReport = z.output<typeof eaTradeReportSchema>;

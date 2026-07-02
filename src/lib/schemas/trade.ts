import { z } from "zod";
import { optionalNumber, requiredNumber } from "@/lib/schemas/form";

// Single source of truth for a manually logged trade. Parses the raw FormData
// strings the Log-trade dialog submits; the EA ingestion route in
// app/api/ea/trades validates the same fields from its JSON payload.
export const tradeFormSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1, "Symbol is required.")
    .transform((s) => s.toUpperCase()),
  direction: z
    .string()
    .refine((v) => v === "LONG" || v === "SHORT", "Pick a direction.")
    .transform((v) => v as "LONG" | "SHORT"),
  entry_price: requiredNumber("Entry price is required."),
  exit_price: optionalNumber("Enter a valid exit price."),
  quantity: optionalNumber("Quantity can't be negative.", { min: 0 }),
  pnl: optionalNumber("Enter a valid P/L."),
  entry_time: z.string().trim().min(1, "Entry date & time is required."),
  notes: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v)),
});

export type TradeFormValues = z.output<typeof tradeFormSchema>;

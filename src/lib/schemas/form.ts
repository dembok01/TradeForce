import { z } from "zod";

export type FieldErrors = Record<string, string>;

// Flatten a ZodError into a { fieldName: firstMessage } map keyed by the first
// path segment, which is what the forms render inline under each input.
export function fieldErrorsFrom(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

// Numeric FormData fields arrive as strings, and "" means "left blank". These
// return `null` for blank and the parsed number otherwise; refinements report
// friendly messages instead of zod's defaults.
export type NumberBounds = { min?: number; max?: number; int?: boolean };

export function optionalNumber(message: string, bounds?: NumberBounds) {
  return z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((n) => n === null || Number.isFinite(n), "Enter a valid number.")
    .refine((n) => n === null || !bounds?.int || Number.isInteger(n), "Enter a whole number.")
    .refine((n) => n === null || bounds?.min === undefined || n >= bounds.min, message)
    .refine((n) => n === null || bounds?.max === undefined || n <= bounds.max, message);
}

export function requiredNumber(message: string, bounds?: NumberBounds) {
  return z
    .string()
    .trim()
    .min(1, message)
    .refine((v) => Number.isFinite(Number(v)), message)
    .transform((v) => Number(v))
    .refine((n) => !bounds?.int || Number.isInteger(n), "Enter a whole number.")
    .refine((n) => bounds?.min === undefined || n >= bounds.min, message)
    .refine((n) => bounds?.max === undefined || n <= bounds.max, message);
}

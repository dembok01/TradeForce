import { z } from "zod";

const email = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .email("Enter a valid email address.");

const newPassword = z.string().min(8, "Password must be at least 8 characters.");

const fullName = z
  .string()
  .trim()
  .min(2, "Enter your full name.")
  .max(80, "That name is too long.")
  // No character class: names carry apostrophes, hyphens, accents and scripts
  // this codebase will never enumerate correctly. The only thing worth
  // rejecting is a name that is entirely punctuation or digits.
  .refine((v) => /\p{L}/u.test(v), "Enter your name as you'd like us to write it.");

/**
 * Phone, kept loose on purpose.
 *
 * The launch market is India, so most of these will be ten digits with or
 * without +91 — but the field exists so an operator can ring somebody about a
 * payment, and a validator that rejects a number a human could dial costs us a
 * sale. Separators are stripped, then 8–15 digits with an optional + is the
 * ITU-E.164 range.
 */
export const phoneField = z
  .string()
  .trim()
  .min(1, "Phone number is required.")
  .transform((v) => v.replace(/[\s().-]/g, ""))
  .refine((v) => /^\+?\d{8,15}$/.test(v), "Enter a phone number we could call, with country code.");

export const signUpSchema = z
  .object({
    fullName,
    phone: phoneField,
    email,
    password: newPassword,
    confirmPassword: z.string().min(1, "Confirm your password."),
    // A checkbox is absent from FormData when unticked, so "" is a refusal
    // rather than a missing field. Named `terms` to match the input.
    terms: z.literal("on", {
      message: "You need to accept the terms before we can create your account.",
    }),
  })
  // Reported against confirmPassword, not the form, so the error lands under
  // the field the trader has to change.
  .refine((v) => v.password === v.confirmPassword, {
    message: "Both passwords need to match.",
    path: ["confirmPassword"],
  });

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Password is required."),
});

export const resetRequestSchema = z.object({ email });

export const updatePasswordSchema = z.object({ password: newPassword });

import { z } from "zod";

const email = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .email("Enter a valid email address.");

const newPassword = z.string().min(8, "Password must be at least 8 characters.");

export const signUpSchema = z.object({ email, password: newPassword });

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Password is required."),
});

export const resetRequestSchema = z.object({ email });

export const updatePasswordSchema = z.object({ password: newPassword });

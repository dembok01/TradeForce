"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isRedirectError, toActionErrorMessage } from "@/lib/action-error";
import {
  resetRequestSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from "@/lib/schemas/auth";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/schemas/form";

function getSiteUrl() {
  const url = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export type AuthActionState = {
  error: string | null;
  fieldErrors?: FieldErrors;
  success?: boolean;
};

const INVALID_FIELDS = "Please fix the highlighted fields.";

export async function signUpAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) {
    return { error: INVALID_FIELDS, fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const { email, password } = parsed.data;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${getSiteUrl()}/auth/callback?next=/onboarding` },
    });

    if (error) {
      return { error: error.message };
    }

    // Email confirmation disabled on the Supabase project -> session is live
    // already. New accounts draft their charter before entering the dashboard
    // (the dashboard layout's gate is the safety net for any other path in).
    if (data.session) {
      redirect("/onboarding");
    }

    return { error: null, success: true };
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: toActionErrorMessage(err, "auth") };
  }
}

export async function signInAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) {
    return { error: INVALID_FIELDS, fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const { email, password } = parsed.data;
  const next = String(formData.get("next") ?? "/dashboard");

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message.toLowerCase().includes("email not confirmed")) {
        return { error: "Please confirm your email before signing in." };
      }
      return { error: "Invalid email or password." };
    }

    redirect(next || "/dashboard");
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: toActionErrorMessage(err, "auth") };
  }
}

export async function signOutAction() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch (err) {
    if (isRedirectError(err)) throw err;
    console.error("[auth] signOut failed, redirecting anyway:", err);
  }
  redirect("/login");
}

export async function requestPasswordResetAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = resetRequestSchema.safeParse({ email: formData.get("email") ?? "" });
  if (!parsed.success) {
    return { error: INVALID_FIELDS, fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${getSiteUrl()}/auth/callback?next=/update-password`,
    });

    if (error) {
      return { error: error.message };
    }

    return { error: null, success: true };
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: toActionErrorMessage(err, "auth") };
  }
}

export async function updatePasswordAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = updatePasswordSchema.safeParse({ password: formData.get("password") ?? "" });
  if (!parsed.success) {
    return { error: INVALID_FIELDS, fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

    if (error) {
      return { error: error.message };
    }

    redirect("/dashboard");
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: toActionErrorMessage(err, "auth") };
  }
}

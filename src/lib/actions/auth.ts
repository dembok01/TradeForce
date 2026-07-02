"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isRedirectError, toActionErrorMessage } from "@/lib/action-error";

function getSiteUrl() {
  const url = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export type AuthActionState = {
  error: string | null;
  success?: boolean;
};

export async function signUpAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${getSiteUrl()}/auth/callback?next=/dashboard` },
    });

    if (error) {
      return { error: error.message };
    }

    // Email confirmation disabled on the Supabase project -> session is live already.
    if (data.session) {
      redirect("/dashboard");
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
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

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
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { error: "Email is required." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
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
  const password = String(formData.get("password") ?? "");

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      return { error: error.message };
    }

    redirect("/dashboard");
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: toActionErrorMessage(err, "auth") };
  }
}

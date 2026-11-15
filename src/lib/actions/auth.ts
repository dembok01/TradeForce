"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isRedirectError, toActionErrorMessage } from "@/lib/action-error";
import { TERMS_VERSION } from "@/lib/legal/terms";
import { safeNext } from "@/lib/safe-next";
import { log } from "@/lib/log";
import {
  resetRequestSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from "@/lib/schemas/auth";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/schemas/form";
import { getSiteUrl } from "@/lib/site-url";

export type AuthActionState = {
  error: string | null;
  fieldErrors?: FieldErrors;
  success?: boolean;
};

const INVALID_FIELDS = "Please fix the highlighted fields.";

/**
 * Create an account.
 *
 * Collects the details an operator actually needs to run a manual payment
 * process — a name to greet, a number to ring, an address to mail — and the
 * record that this person accepted a specific version of the terms.
 *
 * `next` decides where they land. The default is the payment page, because
 * almost everybody arrives here from a buy button; the free route down at the
 * bottom of the landing page passes /onboarding instead.
 */
export async function signUpAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    confirmPassword: formData.get("confirmPassword") ?? "",
    terms: formData.get("terms") ?? "",
  });
  if (!parsed.success) {
    return { error: INVALID_FIELDS, fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const { fullName, phone, email, password } = parsed.data;
  const next = safeNext(formData.get("next"), "/pay");

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
    });

    if (error) {
      return { error: error.message };
    }

    // With email confirmation ON, signUp on an address that already exists
    // succeeds with an obfuscated user rather than erroring, so that the form
    // cannot be used to enumerate customers. Writing the profile in that case
    // would let a stranger overwrite the real account holder's name and phone
    // number. An empty `identities` array is how that case is identified; a
    // live session means this really is a new account.
    const isNewAccount = Boolean(data.session) || (data.user?.identities?.length ?? 0) > 0;

    if (data.user && isNewAccount) {
      // Service role, not their own client: handle_new_user() creates the row
      // with id and email only, and the profiles guard refuses owner writes to
      // the terms columns precisely so that this record is ours, not theirs.
      const { error: profileError } = await createServiceClient()
        .from("profiles")
        .update({
          full_name: fullName,
          phone,
          terms_accepted_at: new Date().toISOString(),
          terms_version: TERMS_VERSION,
        })
        .eq("id", data.user.id);

      // Not fatal. The account exists and they can sign in; losing the name
      // and phone number is a support inconvenience, while refusing the signup
      // of someone who already has credentials is a dead end.
      if (profileError) {
        log.error("signup profile details write failed", {
          detail: profileError.message,
          userId: data.user.id,
        });
      }
    }

    // Email confirmation is disabled on the Supabase project -> the session is
    // live already and they go straight on. The success card below is the
    // confirmation-enabled path.
    if (data.session) {
      redirect(next);
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
  const next = safeNext(formData.get("next"));

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message.toLowerCase().includes("email not confirmed")) {
        return { error: "Please confirm your email before signing in." };
      }
      return { error: "Invalid email or password." };
    }

    redirect(next);
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

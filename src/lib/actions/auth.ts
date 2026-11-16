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
 * `next` decides where they land. The default is the dashboard, which is
 * locked until a plan is active: a new account sees the product first and
 * meets the payment page when it reaches for something that needs one.
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
  const next = safeNext(formData.get("next"), "/dashboard");

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
    // cannot be used to enumerate customers. With it OFF — the current project
    // setting — the same attempt is a 422 and we returned above. So this code
    // is only reachable for an existing account if that dashboard toggle is
    // flipped, which is not something this repo can see or hold still.
    //
    // An empty `identities` array is how the obfuscated case is identified,
    // and a live session means this really is a new account. Both are kept,
    // but neither is load-bearing: see the `.is()` below.
    const isNewAccount = Boolean(data.session) || (data.user?.identities?.length ?? 0) > 0;

    if (data.user && isNewAccount) {
      // Service role, not their own client: handle_new_user() creates the row
      // with id and email only, and the profiles guard refuses owner writes to
      // the terms columns precisely so that this record is ours, not theirs.
      //
      // `.is("terms_accepted_at", null)` is what actually makes this safe, and
      // it is here rather than in the condition above on purpose. The service
      // role bypasses the profiles guard, so this is the one write in the app
      // that could overwrite somebody's acceptance record — and the record is
      // only worth keeping if nothing can reset it. Conditioning the UPDATE on
      // the row never having recorded an acceptance means it can only ever
      // land on a freshly inserted profile, whatever GoTrue chose to return
      // and whichever way the confirmation toggle is set.
      //
      // Deliberately NOT done by passing these through signUp's options.data
      // for handle_new_user() to copy: user metadata is supplied by whoever
      // posted the form, and the moment the acceptance timestamp comes from
      // there it stops being our evidence and becomes their claim.
      const { data: written, error: profileError } = await createServiceClient()
        .from("profiles")
        .update({
          full_name: fullName,
          phone,
          terms_accepted_at: new Date().toISOString(),
          terms_version: TERMS_VERSION,
        })
        .eq("id", data.user.id)
        .is("terms_accepted_at", null)
        .select("id");

      // Not fatal. The account exists and they can sign in; losing the name
      // and phone number is a support inconvenience, while refusing the signup
      // of someone who already has credentials is a dead end.
      if (profileError) {
        log.error("signup profile details write failed", {
          detail: profileError.message,
          userId: data.user.id,
        });
      } else if (!written?.length) {
        // No row matched: this address already had an acceptance on file. A
        // re-submitted signup for an unconfirmed account reaches here
        // legitimately; so would an attempt to overwrite someone else's
        // details. Either way nothing was changed, and we want to know.
        log.warn("signup details not written: profile already has an acceptance on file", {
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

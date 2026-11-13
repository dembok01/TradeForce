"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAuthedActionContext } from "@/lib/actions/_helpers";
import { toActionErrorMessage } from "@/lib/action-error";
import { onboardingSchema } from "@/lib/schemas/onboarding";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/schemas/form";
import { localTimeToUtc } from "@/lib/trading-sessions";
import { log } from "@/lib/log";

export type OnboardingActionState = {
  error: string | null;
  fieldErrors?: FieldErrors;
};

// The wizard holds controlled state, so this takes a plain serializable object
// (no FormData/checkbox preprocess). The server re-validates the whole thing
// regardless of what the client already checked per step.
export async function completeOnboardingAction(input: unknown): Promise<OnboardingActionState> {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const values = parsed.data;

  try {
    const ctx = await getAuthedActionContext();
    if (!ctx.ok) return { error: ctx.error };
    const { supabase, userId, account } = ctx;

    // Every provision is optional, but an "active" charter with nothing in it
    // is a lie on the dashboard (Rule Settings enforces the same).
    const hasAnyRule =
      values.daily_loss_limit !== null ||
      values.risk_per_trade_percent !== null ||
      values.max_trades_per_day !== null ||
      values.max_open_positions !== null ||
      values.session_london_enabled ||
      values.session_new_york_enabled ||
      values.session_asian_enabled ||
      values.session_london_ny_overlap_enabled ||
      values.custom_session_start !== null;

    // trading_rules is unique(account_id), so signing the charter is one upsert.
    const { error: rulesError } = await supabase.from("trading_rules").upsert(
      {
        account_id: account.id,
        user_id: userId,
        daily_loss_limit: values.daily_loss_limit,
        max_trades_per_day: values.max_trades_per_day,
        max_open_positions: values.max_open_positions,
        risk_per_trade_percent: values.risk_per_trade_percent,
        session_london_enabled: values.session_london_enabled,
        session_new_york_enabled: values.session_new_york_enabled,
        session_asian_enabled: values.session_asian_enabled,
        session_london_ny_overlap_enabled: values.session_london_ny_overlap_enabled,
        // Typed on the trader's clock, stored (and enforced) as UTC.
        custom_session_start:
          values.custom_session_start && localTimeToUtc(values.custom_session_start, values.timezone),
        custom_session_end:
          values.custom_session_end && localTimeToUtc(values.custom_session_end, values.timezone),
        timezone: values.timezone,
        is_active: hasAnyRule,
      },
      { onConflict: "account_id" }
    );
    if (rulesError) {
      log.error("onboarding rules upsert failed", { detail: rulesError.message, accountId: account.id });
      return { error: "Couldn't save your charter. Please try again." };
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        full_name: values.full_name,
        timezone: values.timezone,
        connection_route: values.connection_route,
        markets_traded: values.markets_traded,
        prop_firm: values.prop_firm,
        onboarded_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (profileError) {
      log.error("onboarding profile update failed", { detail: profileError.message, userId });
      return { error: "Couldn't save your profile. Please try again." };
    }

    revalidatePath("/dashboard");
  } catch (err) {
    return { error: toActionErrorMessage(err, "onboarding") };
  }

  // Outside the try so the redirect control-flow error can't be swallowed.
  //
  // Enforcement doesn't exist until a terminal is connected, so that is the one
  // next step that matters - but it is a different page per route, and sending a
  // funded trader to the hosted form is how they end up handing us a password
  // their firm forbids them to share.
  redirect(
    values.connection_route === "funded" ? "/dashboard/ea-setup/funded" : "/dashboard/ea-setup"
  );
}

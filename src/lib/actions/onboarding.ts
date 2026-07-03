"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAuthedActionContext } from "@/lib/actions/_helpers";
import { toActionErrorMessage } from "@/lib/action-error";
import { onboardingSchema } from "@/lib/schemas/onboarding";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/schemas/form";

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
        timezone: values.timezone,
        is_active: true,
      },
      { onConflict: "account_id" }
    );
    if (rulesError) return { error: rulesError.message };

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        full_name: values.full_name,
        timezone: values.timezone,
        experience_level: values.experience_level,
        markets_traded: values.markets_traded,
        prop_firm: values.prop_firm,
        onboarded_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (profileError) return { error: profileError.message };

    revalidatePath("/dashboard");
  } catch (err) {
    return { error: toActionErrorMessage(err, "onboarding") };
  }

  // Outside the try so the redirect control-flow error can't be swallowed.
  redirect("/dashboard?tour=1");
}

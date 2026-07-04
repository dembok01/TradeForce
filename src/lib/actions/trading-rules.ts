"use server";

import { revalidatePath } from "next/cache";
import { getAuthedActionContext } from "@/lib/actions/_helpers";
import { toActionErrorMessage } from "@/lib/action-error";
import { ruleSettingsSchema, sessionConfigSchema } from "@/lib/schemas/rules";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/schemas/form";
import { log } from "@/lib/log";
import type { ServerClient } from "@/lib/data/account";

export type RuleActionState = {
  error: string | null;
  fieldErrors?: FieldErrors;
  success?: boolean;
};

async function ensureTradingRulesRow(supabase: ServerClient, accountId: string, userId: string) {
  const { data: existing, error: readError } = await supabase
    .from("trading_rules")
    .select("id")
    .eq("account_id", accountId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  if (existing) return;

  const { error } = await supabase
    .from("trading_rules")
    .insert({ account_id: accountId, user_id: userId });
  // Two parallel first saves can both miss the read; unique(account_id)
  // rejects the loser — the row exists either way, which is all we need.
  if (error && error.code !== "23505") throw new Error(error.message);
}

export async function updateSessionConfigAction(
  _prevState: RuleActionState,
  formData: FormData
): Promise<RuleActionState> {
  const parsed = sessionConfigSchema.safeParse({
    session_london_enabled: formData.get("session_london_enabled"),
    session_new_york_enabled: formData.get("session_new_york_enabled"),
    session_asian_enabled: formData.get("session_asian_enabled"),
    session_london_ny_overlap_enabled: formData.get("session_london_ny_overlap_enabled"),
    custom_session_start: formData.get("custom_session_start") ?? "",
    custom_session_end: formData.get("custom_session_end") ?? "",
    timezone: formData.get("timezone") ?? "UTC",
  });
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const values = parsed.data;

  try {
    const ctx = await getAuthedActionContext();
    if (!ctx.ok) return { error: ctx.error };
    const { supabase, userId, account } = ctx;
    await ensureTradingRulesRow(supabase, account.id, userId);

    const { error } = await supabase
      .from("trading_rules")
      .update({
        session_london_enabled: values.session_london_enabled,
        session_new_york_enabled: values.session_new_york_enabled,
        session_asian_enabled: values.session_asian_enabled,
        session_london_ny_overlap_enabled: values.session_london_ny_overlap_enabled,
        custom_session_start: values.custom_session_start,
        custom_session_end: values.custom_session_end,
        timezone: values.timezone,
      })
      .eq("account_id", account.id);

    if (error) {
      log.error("session config update failed", { detail: error.message, accountId: account.id });
      return { error: "Couldn't save session settings. Please try again." };
    }

    revalidatePath("/dashboard/sessions");
    revalidatePath("/dashboard/trading-plan");
    revalidatePath("/dashboard");
    return { error: null, success: true };
  } catch (err) {
    return { error: toActionErrorMessage(err, "trading-rules") };
  }
}

export async function updateRuleSettingsAction(
  _prevState: RuleActionState,
  formData: FormData
): Promise<RuleActionState> {
  const parsed = ruleSettingsSchema.safeParse({
    daily_loss_limit: formData.get("daily_loss_limit") ?? "",
    max_trades_per_day: formData.get("max_trades_per_day") ?? "",
    max_open_positions: formData.get("max_open_positions") ?? "",
    risk_per_trade_percent: formData.get("risk_per_trade_percent") ?? "",
    is_active: formData.get("is_active"),
  });
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const values = parsed.data;

  try {
    const ctx = await getAuthedActionContext();
    if (!ctx.ok) return { error: ctx.error };
    const { supabase, userId, account } = ctx;
    await ensureTradingRulesRow(supabase, account.id, userId);

    // An "active" charter with nothing to enforce is a lie on the dashboard —
    // require at least one limit here, or a session window configured on the
    // Sessions page.
    const noLimits =
      values.daily_loss_limit === null &&
      values.max_trades_per_day === null &&
      values.max_open_positions === null &&
      values.risk_per_trade_percent === null;
    if (values.is_active && noLimits) {
      const { data: current, error: readError } = await supabase
        .from("trading_rules")
        .select(
          "session_london_enabled, session_new_york_enabled, session_asian_enabled, session_london_ny_overlap_enabled, custom_session_start, custom_session_end"
        )
        .eq("account_id", account.id)
        .maybeSingle();
      if (readError) {
        log.error("rule settings read failed", { detail: readError.message, accountId: account.id });
        return { error: "Couldn't verify your session settings. Please try again." };
      }

      const hasSessionRule =
        current &&
        (current.session_london_enabled ||
          current.session_new_york_enabled ||
          current.session_asian_enabled ||
          current.session_london_ny_overlap_enabled ||
          (current.custom_session_start && current.custom_session_end));
      if (!hasSessionRule) {
        return {
          error:
            "Set at least one limit (or a session window on the Sessions page) before activating the charter.",
        };
      }
    }

    const { error } = await supabase
      .from("trading_rules")
      .update({
        daily_loss_limit: values.daily_loss_limit,
        max_trades_per_day: values.max_trades_per_day,
        max_open_positions: values.max_open_positions,
        risk_per_trade_percent: values.risk_per_trade_percent,
        is_active: values.is_active,
      })
      .eq("account_id", account.id);

    if (error) {
      log.error("rule settings update failed", { detail: error.message, accountId: account.id });
      return { error: "Couldn't save rule settings. Please try again." };
    }

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/trading-plan");
    revalidatePath("/dashboard");
    return { error: null, success: true };
  } catch (err) {
    return { error: toActionErrorMessage(err, "trading-rules") };
  }
}

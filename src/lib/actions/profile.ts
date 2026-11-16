"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthedUser } from "@/lib/data/auth";
import { toActionErrorMessage } from "@/lib/action-error";
import {
  connectionRouteEnum,
  profileDetailsSchema,
  type ConnectionRoute,
} from "@/lib/schemas/onboarding";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/schemas/form";
import { log } from "@/lib/log";

export type ProfileActionState = {
  error: string | null;
  fieldErrors?: FieldErrors;
  success?: boolean;
};

export async function updateProfileAction(
  _prevState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  const parsed = profileDetailsSchema.safeParse({
    full_name: formData.get("full_name") ?? "",
    markets_traded: formData.getAll("markets_traded"),
    prop_firm: formData.get("prop_firm") ?? "",
    phone: formData.get("phone") ?? "",
  });
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  try {
    const user = await getAuthedUser();
    if (!user) return { error: "Not authenticated." };

    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: parsed.data.full_name,
        markets_traded: parsed.data.markets_traded,
        prop_firm: parsed.data.prop_firm,
        phone: parsed.data.phone,
      })
      .eq("id", user.id);

    if (error) {
      log.error("profile update failed", { detail: error.message, userId: user.id });
      return { error: "Couldn't save your profile. Please try again." };
    }

    // "layout" so the sidebar greeting refreshes on every dashboard page.
    revalidatePath("/dashboard", "layout");
    return { error: null, success: true };
  } catch (err) {
    return { error: toActionErrorMessage(err, "profile") };
  }
}

/**
 * Switch between normal account mode (our hosted terminal, signed in with the
 * trader's MT5 password) and funded account mode (the downloadable EA on their
 * own MT5). Only changes which setup the dashboard shows: a hosted terminal
 * that is already running keeps running until they stop it.
 */
export async function setAccountModeAction(route: ConnectionRoute) {
  const parsed = connectionRouteEnum.safeParse(route);
  if (!parsed.success) throw new Error("Unknown account mode.");

  const user = await getAuthedUser();
  if (!user) throw new Error("Please sign in again.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ connection_route: parsed.data })
    .eq("id", user.id);
  if (error) {
    log.error("account mode update failed", { detail: error.message, userId: user.id });
    throw new Error("Couldn't switch modes. Please try again.");
  }

  revalidatePath("/dashboard", "layout");
  redirect(parsed.data === "funded" ? "/dashboard/ea-setup/funded" : "/dashboard/ea-setup");
}

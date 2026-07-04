"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthedUser } from "@/lib/data/auth";
import { toActionErrorMessage } from "@/lib/action-error";
import { profileDetailsSchema } from "@/lib/schemas/onboarding";
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
    experience_level: formData.get("experience_level") ?? "",
    markets_traded: formData.getAll("markets_traded"),
    prop_firm: formData.get("prop_firm") ?? "",
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
        experience_level: parsed.data.experience_level,
        markets_traded: parsed.data.markets_traded,
        prop_firm: parsed.data.prop_firm,
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

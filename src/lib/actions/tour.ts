"use server";

import { createClient } from "@/lib/supabase/server";
import { toActionErrorMessage } from "@/lib/action-error";

// Called on Finish AND Skip — skippers must not be re-prompted every login.
// Manual relaunch (the "?" button) ignores this flag entirely.
export async function completeTourAction(): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const { error } = await supabase
      .from("profiles")
      .update({ tour_completed_at: new Date().toISOString() })
      .eq("id", user.id);
    if (error) return { error: error.message };

    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err, "tour") };
  }
}

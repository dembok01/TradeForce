import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAuthedUser } from "@/lib/data/auth";
import type { Database } from "@/lib/supabase/database.types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * The current user's profile row (created by the signup trigger), memoized
 * per request — the layout, timezone fallback, and greeting all share one read.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getAuthedUser();
  if (!user) return null;

  const supabase = await createClient();

  // Throw on failure rather than returning null: the dashboard layout treats
  // null as "not onboarded", so a swallowed DB error would bounce a fully
  // onboarded user back into /onboarding instead of the error boundary.
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
});

import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * The authenticated user for this request, memoized. auth.getUser() is a
 * network round-trip to Supabase Auth — without cache() the layout, profile
 * read, and account read each paid for their own.
 */
export const getAuthedUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

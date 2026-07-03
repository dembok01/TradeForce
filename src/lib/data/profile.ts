import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ServerClient } from "@/lib/data/account";
import type { Database } from "@/lib/supabase/database.types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * The current user's profile row (created by the signup trigger). Pass an
 * existing client to avoid building a second one, mirroring
 * getOrCreatePrimaryAccount.
 */
export async function getProfile(client?: ServerClient): Promise<Profile | null> {
  const supabase = client ?? (await createClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return data;
}

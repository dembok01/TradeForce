import "server-only";
import { getAccountContext } from "@/lib/data/context";
import type { Database } from "@/lib/supabase/database.types";

export type ApiKey = Database["public"]["Tables"]["api_keys"]["Row"];

export async function getApiKeys(): Promise<ApiKey[]> {
  const { supabase, account } = await getAccountContext();

  const { data, error } = await supabase
    .from("api_keys")
    .select("*")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

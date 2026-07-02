import "server-only";
import { getAccountContext } from "@/lib/data/context";
import type { Database } from "@/lib/supabase/database.types";

export type Trade = Database["public"]["Tables"]["trades"]["Row"];

export async function getTrades(params: { from?: string; to?: string } = {}): Promise<Trade[]> {
  const { supabase, account } = await getAccountContext();

  let query = supabase
    .from("trades")
    .select("*")
    .eq("account_id", account.id)
    .order("entry_time", { ascending: false });

  if (params.from) query = query.gte("entry_time", params.from);
  if (params.to) query = query.lte("entry_time", params.to);

  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}

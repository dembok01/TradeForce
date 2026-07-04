import "server-only";
import { cache } from "react";
import { getAccountContext } from "@/lib/data/context";
import { getEaLastSeenAt } from "@/lib/data/_shared";
import { eaSeenWithin, EA_ACTIVE_WINDOW_MS } from "@/lib/ea-connection";
import type { Database } from "@/lib/supabase/database.types";

export type ApiKey = Database["public"]["Tables"]["api_keys"]["Row"];

export type EaConnection = { lastSeenAt: string | null; manualEntryLocked: boolean };

/** Whether an EA has reported recently enough to own the journal (see ea-connection.ts). */
export const getEaConnection = cache(async (): Promise<EaConnection> => {
  const { supabase, account } = await getAccountContext();
  const lastSeenAt = await getEaLastSeenAt(supabase, account.id);
  return { lastSeenAt, manualEntryLocked: eaSeenWithin(lastSeenAt, EA_ACTIVE_WINDOW_MS) };
});

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

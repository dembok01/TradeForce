import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/service";
import { log } from "@/lib/log";

/**
 * One step in a trader's connection log (connection_events). The pool agent
 * writes the terminal's side of the story; this is the website's side - what
 * the trader and support did. Best-effort: a logging failure must never fail
 * the action being logged.
 */
export async function logConnection(
  accountId: string,
  userId: string,
  kind: string,
  level: "info" | "warn" | "error",
  message: string,
  detail?: Json,
): Promise<void> {
  const { error } = await createServiceClient()
    .from("connection_events")
    .insert({ account_id: accountId, user_id: userId, source: "web", kind, level, message, detail: detail ?? null });
  if (error) log.warn("connection log write failed", { detail: error.message, accountId });
}

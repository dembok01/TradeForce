import "server-only";
import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";

export const API_KEY_PREFIX = "tf_live_";

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export type AuthenticatedEaRequest = { userId: string; accountId: string; apiKeyId: string };

/**
 * Verifies the Authorization: Bearer <key> header an EA sends on every request
 * against the api_keys table (hashed, never stored in plaintext). Returns null
 * on any failure — callers should respond 401 without leaking which part failed.
 */
export async function verifyEaRequest(request: Request): Promise<AuthenticatedEaRequest | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const rawKey = authHeader.slice("Bearer ".length).trim();
  if (!rawKey.startsWith(API_KEY_PREFIX)) return null;

  const supabase = createServiceClient();
  const { data: keyRow } = await supabase
    .from("api_keys")
    .select("id, user_id, account_id, revoked_at")
    .eq("key_hash", hashApiKey(rawKey))
    .maybeSingle();

  if (!keyRow || keyRow.revoked_at) return null;

  await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);

  return { userId: keyRow.user_id, accountId: keyRow.account_id, apiKeyId: keyRow.id };
}

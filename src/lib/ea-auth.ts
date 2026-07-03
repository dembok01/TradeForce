import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createRateLimiter } from "@/lib/rate-limit";

export const API_KEY_PREFIX = "tf_live_";

// Unsalted SHA-256 by design: keys are 24 random bytes (192 bits of entropy),
// so rainbow/dictionary attacks don't apply, and the deterministic hash is
// what makes the unique-index lookup on api_keys.key_hash possible.
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export type EaAuthSuccess = {
  ok: true;
  userId: string;
  accountId: string;
  apiKeyId: string;
};
export type EaAuthFailure = { ok: false; reason: "unauthorized" | "rate_limited" };
export type EaAuthResult = EaAuthSuccess | EaAuthFailure;

// Generous for a well-behaved EA (60s config poll + a few-second ping loop +
// occasional trade reports); tight enough to stop a bugged retry loop from
// hammering the DB.
const checkEaRateLimit = createRateLimiter({ limit: 120, windowMs: 60_000 });

/**
 * Verifies the Authorization: Bearer <key> header an EA sends on every request
 * against the api_keys table (hashed, never stored in plaintext). Rate limiting
 * runs before the DB lookup, keyed on the presented key's hash. Failures don't
 * say which part failed — respond via eaFailureResponse.
 */
export async function verifyEaRequest(request: Request): Promise<EaAuthResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false, reason: "unauthorized" };

  const rawKey = authHeader.slice("Bearer ".length).trim();
  if (!rawKey.startsWith(API_KEY_PREFIX)) return { ok: false, reason: "unauthorized" };

  const keyHash = hashApiKey(rawKey);
  if (!checkEaRateLimit(keyHash)) return { ok: false, reason: "rate_limited" };

  const supabase = createServiceClient();
  const { data: keyRow } = await supabase
    .from("api_keys")
    .select("id, user_id, account_id, revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (!keyRow || keyRow.revoked_at) return { ok: false, reason: "unauthorized" };

  await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);

  return { ok: true, userId: keyRow.user_id, accountId: keyRow.account_id, apiKeyId: keyRow.id };
}

export function eaFailureResponse(failure: EaAuthFailure): NextResponse {
  if (failure.reason === "rate_limited") {
    return NextResponse.json(
      { error: "Rate limit exceeded." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }
  return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401 });
}

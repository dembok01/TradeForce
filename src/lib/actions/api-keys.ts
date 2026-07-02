"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthedActionContext } from "@/lib/actions/_helpers";
import { API_KEY_PREFIX, hashApiKey } from "@/lib/ea-auth";
import { toActionErrorMessage } from "@/lib/action-error";
import type { ApiKey } from "@/lib/data/api-keys";

export async function generateApiKeyAction(
  label: string
): Promise<{ error: string | null; rawKey?: string; key?: ApiKey }> {
  try {
    const ctx = await getAuthedActionContext();
    if (!ctx.ok) return { error: ctx.error };
    const { supabase, userId, account } = ctx;

    const rawKey = `${API_KEY_PREFIX}${randomBytes(24).toString("hex")}`;
    const keyPrefix = rawKey.slice(0, API_KEY_PREFIX.length + 8);

    const { data: created, error } = await supabase
      .from("api_keys")
      .insert({
        user_id: userId,
        account_id: account.id,
        label: label.trim() || "EA Key",
        key_prefix: keyPrefix,
        key_hash: hashApiKey(rawKey),
      })
      .select("*")
      .single();

    if (error || !created) return { error: error?.message ?? "Couldn't create key." };

    revalidatePath("/dashboard/settings");
    return { error: null, rawKey, key: created };
  } catch (err) {
    return { error: toActionErrorMessage(err, "api-keys") };
  }
}

export async function revokeApiKeyAction(keyId: string): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", keyId);

    if (error) return { error: error.message };

    revalidatePath("/dashboard/settings");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err, "api-keys") };
  }
}

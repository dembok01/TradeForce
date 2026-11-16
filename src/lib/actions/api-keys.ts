"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthedActionContext } from "@/lib/actions/_helpers";
import { getEntitlement } from "@/lib/data/billing";
import { getProfile } from "@/lib/data/profile";
import { API_KEY_PREFIX, hashApiKey } from "@/lib/ea-auth";
import { toActionErrorMessage } from "@/lib/action-error";
import { log } from "@/lib/log";
import type { ApiKey } from "@/lib/data/api-keys";

export async function generateApiKeyAction(
  label: string
): Promise<{ error: string | null; rawKey?: string; key?: ApiKey }> {
  try {
    const ctx = await getAuthedActionContext();
    if (!ctx.ok) return { error: ctx.error };
    const { supabase, userId, account } = ctx;

    // The key is what connects a terminal to us, so it is the paywall. Checked
    // here and not only in the UI: this is a server action, which means its
    // URL is callable by anyone holding a session cookie.
    const entitlement = await getEntitlement();
    if (!entitlement.active) {
      return { error: "EA keys are issued once your plan is active." };
    }

    // One connection per account: a key is for the downloadable EA, which is
    // funded account mode. In normal mode the hosted terminal mints its own.
    if ((await getProfile())?.connection_route !== "funded") {
      return {
        error:
          "EA keys are for funded account mode. In normal account mode we run the terminal for " +
          "you. Switch modes on the EA setup page.",
      };
    }

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

    if (error || !created) {
      if (error) log.error("api key insert failed", { detail: error.message, accountId: account.id });
      return { error: "Couldn't create key. Please try again." };
    }

    revalidatePath("/dashboard/settings");
    return { error: null, rawKey, key: created };
  } catch (err) {
    return { error: toActionErrorMessage(err, "api-keys") };
  }
}

export async function revokeApiKeyAction(keyId: string): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();
    // .select() so a no-op (nonexistent or non-owned id filtered by RLS) is
    // reported as a failure instead of a silent false success.
    const { data, error } = await supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", keyId)
      .select("id");

    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: "Key not found." };

    revalidatePath("/dashboard/settings");
    return { error: null };
  } catch (err) {
    return { error: toActionErrorMessage(err, "api-keys") };
  }
}

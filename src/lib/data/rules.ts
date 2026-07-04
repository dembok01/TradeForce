import "server-only";
import { cache } from "react";
import { getAccountContext } from "@/lib/data/context";
import { getProfile } from "@/lib/data/profile";
import { safeTimezone } from "@/lib/time-boundaries";
import type { Database } from "@/lib/supabase/database.types";

export type TradingRules = Database["public"]["Tables"]["trading_rules"]["Row"];

/**
 * The caller's trading_rules row, read once per request. Before this, a single
 * dashboard render fetched the same row up to three times (limits subset,
 * timezone, full row).
 */
export const getAccountRules = cache(async (): Promise<TradingRules | null> => {
  const { supabase, account } = await getAccountContext();
  const { data, error } = await supabase
    .from("trading_rules")
    .select("*")
    .eq("account_id", account.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
});

/**
 * The timezone that defines the caller's "today". trading_rules.timezone is
 * the enforcement source (it's what the EA config returns too); profiles is
 * the fallback for users who haven't created a rules row yet.
 */
export const getRequestTimezone = cache(async (): Promise<string> => {
  const rules = await getAccountRules();
  if (rules?.timezone) return safeTimezone(rules.timezone);
  const profile = await getProfile();
  return safeTimezone(profile?.timezone);
});

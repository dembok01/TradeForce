import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthedUser } from "@/lib/data/auth";
import { entitlementFrom, type Entitlement } from "@/lib/billing/entitlement";
import { log } from "@/lib/log";
import type { Database } from "@/lib/supabase/database.types";

export type Payment = Database["public"]["Tables"]["payments"]["Row"];

/** Statuses where the trader still has something in flight. */
export const OPEN_STATUSES = ["awaiting_payment", "claimed"] as const;

export const PROOF_BUCKET = "payment-proofs";

/**
 * What this trader has paid for. Read through their own client, so RLS is the
 * thing enforcing that it is theirs rather than a `.eq()` I could forget.
 *
 * Memoized per request: the dashboard layout and every locked page ask, and
 * they should get one answer from one read.
 */
export const getEntitlement = cache(async (): Promise<Entitlement> => {
  const user = await getAuthedUser();
  if (!user) return entitlementFrom(null, null);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("plan, plan_expires_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    // A read failure must not silently read as "entitled". Free is the safe
    // answer, and the log is how we find out it happened.
    log.error("entitlement read failed", { detail: error.message, userId: user.id });
    return entitlementFrom(null, null);
  }
  return entitlementFrom(data?.plan ?? null, data?.plan_expires_at ?? null);
});

/** The payment the trader is in the middle of, if any. At most one exists. */
export async function getOpenPayment(): Promise<Payment | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payments")
    .select("*")
    .in("status", [...OPEN_STATUSES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** Their receipts, newest first. */
export async function getMyPayments(limit = 12): Promise<Payment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export type PaymentClaim = Payment & {
  email: string | null;
  fullName: string | null;
  /** Collected at signup. This is a manual process: sometimes it needs a call. */
  phone: string | null;
};

/**
 * The ops queue. Service role, because the console spans every tenant — the
 * same deliberate inversion the rest of lib/data/admin.ts relies on, gated by
 * the admin layout rather than by RLS.
 *
 * Two queries and a join in JS rather than a PostgREST embed: `payments.user_id`
 * references auth.users, not public.profiles, so there is no relationship for
 * PostgREST to infer and an embed would fail at runtime with a schema-cache
 * error rather than at build.
 */
export async function getPaymentQueue(limit = 200): Promise<PaymentClaim[]> {
  const supabase = createServiceClient();
  const { data: payments, error } = await supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    log.error("payment queue read failed", { detail: error.message });
    return [];
  }
  if (!payments?.length) return [];

  const ids = [...new Set(payments.map((p) => p.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name, phone")
    .in("id", ids);

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return payments.map((p) => ({
    ...p,
    email: byId.get(p.user_id)?.email ?? null,
    fullName: byId.get(p.user_id)?.full_name ?? null,
    phone: byId.get(p.user_id)?.phone ?? null,
  }));
}

/**
 * A short-lived link to a proof screenshot. The bucket is private, so this is
 * the only way to see one, and the link dies in ten minutes — long enough to
 * check a payment, short enough that a copied admin URL is not a leak.
 */
export async function signedProofUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await createServiceClient()
    .storage.from(PROOF_BUCKET)
    .createSignedUrl(path, 600);
  if (error) {
    log.error("proof signed url failed", { detail: error.message });
    return null;
  }
  return data?.signedUrl ?? null;
}

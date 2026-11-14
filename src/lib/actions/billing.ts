"use server";

import { revalidatePath } from "next/cache";
import { getAuthedUser } from "@/lib/data/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { periodFor } from "@/lib/billing/plans";
import { newReference } from "@/lib/billing/reference";
import { OPEN_STATUSES, PROOF_BUCKET } from "@/lib/data/billing";
import { toActionErrorMessage } from "@/lib/action-error";
import { log } from "@/lib/log";

/**
 * Buying a paid period by UPI.
 *
 * Every write here goes through the service role, deliberately. RLS on
 * `payments` grants SELECT on own rows and nothing more: a trader who could
 * UPDATE their own row could set `status = 'approved'` and grant themselves a
 * year, and Postgres RLS has no clean per-column guard against that. These
 * actions are the only writer, and they take `user_id` from the session —
 * never from the form.
 */
export type BillingActionState = { error: string | null; success?: boolean };

const PROOF_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const PROOF_MAX_BYTES = 5 * 1024 * 1024;

/** A UPI transaction ID as GPay prints it on the receipt: twelve digits. */
const UTR = /^\d{12}$/;

/**
 * Open (or re-point) this trader's payment and hand back its reference.
 *
 * Idempotent on purpose: a trader who changes their mind between one month and
 * twelve keeps the same row and the same reference, because a second reference
 * for the same person is a second thing the operator has to match by hand.
 */
export async function startPaymentAction(months: number): Promise<BillingActionState> {
  try {
    const user = await getAuthedUser();
    if (!user) return { error: "Not authenticated." };

    const period = periodFor(months);
    if (!period) return { error: "That isn't a period we sell." };

    const supabase = createServiceClient();
    const { data: open } = await supabase
      .from("payments")
      .select("id, status")
      .eq("user_id", user.id)
      .in("status", [...OPEN_STATUSES])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (open?.status === "claimed") {
      return {
        error:
          "You've already sent us a payment to check. We'll confirm it shortly — " +
          "starting another one would double-charge you.",
      };
    }

    if (open) {
      const { error } = await supabase
        .from("payments")
        .update({ months: period.months, amount_inr: period.amountInr })
        .eq("id", open.id)
        .eq("status", "awaiting_payment");
      if (error) {
        log.error("repoint payment failed", { detail: error.message, userId: user.id });
        return { error: "Couldn't update your payment. Try again in a moment." };
      }
      revalidatePath("/dashboard/billing");
      return { error: null, success: true };
    }

    // 32^6 references make a collision a lottery win, but the column is unique
    // and a lottery win should not be a 500 on a payment page.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase.from("payments").insert({
        user_id: user.id,
        reference: newReference(),
        months: period.months,
        amount_inr: period.amountInr,
      });
      if (!error) {
        revalidatePath("/dashboard/billing");
        return { error: null, success: true };
      }
      if (error.code !== "23505") {
        log.error("start payment failed", { detail: error.message, userId: user.id });
        return { error: "Couldn't start your payment. Try again in a moment." };
      }
      // 23505 can also be the one-open-payment-per-trader index, which means a
      // double-submitted form already created the row. That is a success.
      const { data: now } = await supabase
        .from("payments")
        .select("id")
        .eq("user_id", user.id)
        .in("status", [...OPEN_STATUSES])
        .limit(1)
        .maybeSingle();
      if (now) {
        revalidatePath("/dashboard/billing");
        return { error: null, success: true };
      }
    }
    return { error: "Couldn't start your payment. Try again in a moment." };
  } catch (err) {
    return { error: toActionErrorMessage(err, "start-payment") };
  }
}

/** Abandon an unpaid payment so the trader isn't stuck looking at a stale QR. */
export async function cancelPaymentAction(): Promise<BillingActionState> {
  try {
    const user = await getAuthedUser();
    if (!user) return { error: "Not authenticated." };

    // Only an untouched row. Once a transaction ID is attached, the money may
    // genuinely have moved and deleting the record would erase the evidence.
    const { error } = await createServiceClient()
      .from("payments")
      .delete()
      .eq("user_id", user.id)
      .eq("status", "awaiting_payment");
    if (error) return { error: "Couldn't cancel that. Try again in a moment." };

    revalidatePath("/dashboard/billing");
    return { error: null, success: true };
  } catch (err) {
    return { error: toActionErrorMessage(err, "cancel-payment") };
  }
}

/**
 * "I've paid" — the transaction ID, and optionally the receipt screenshot.
 *
 * The ID is required because it is what the operator types into GPay to find
 * the credit. The screenshot is optional corroboration: it is often easier for
 * a trader to produce, but it cannot be searched.
 */
export async function claimPaymentAction(
  _prev: BillingActionState,
  formData: FormData
): Promise<BillingActionState> {
  try {
    const user = await getAuthedUser();
    if (!user) return { error: "Not authenticated." };

    // Traders paste this with spaces in it more often than not.
    const utr = String(formData.get("utr") ?? "").replace(/\s+/g, "");
    if (!UTR.test(utr)) {
      return {
        error:
          "That doesn't look like a UPI transaction ID. It's the 12-digit number on your " +
          "payment receipt — in Google Pay, open the payment and look for “UPI transaction ID”.",
      };
    }

    const supabase = createServiceClient();
    const { data: open } = await supabase
      .from("payments")
      .select("id, reference, status")
      .eq("user_id", user.id)
      .in("status", [...OPEN_STATUSES])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!open) return { error: "Start a payment first, then tell us you've paid." };
    if (open.status === "claimed") {
      return { error: "You've already sent this one to us. We'll confirm it shortly." };
    }

    let proofPath: string | null = null;
    const proof = formData.get("proof");
    if (proof instanceof File && proof.size > 0) {
      const ext = PROOF_TYPES[proof.type];
      if (!ext) {
        return { error: "The screenshot needs to be a JPEG, PNG or WebP image." };
      }
      if (proof.size > PROOF_MAX_BYTES) {
        return { error: "That screenshot is over 5MB. A normal phone screenshot is well under." };
      }

      // Keyed by user and payment so one trader can never overwrite another's
      // proof, and a re-submission overwrites only its own.
      proofPath = `${user.id}/${open.id}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(PROOF_BUCKET)
        .upload(proofPath, Buffer.from(await proof.arrayBuffer()), {
          contentType: proof.type,
          upsert: true,
        });
      if (uploadError) {
        log.error("proof upload failed", { detail: uploadError.message, userId: user.id });
        // The transaction ID is the part that matters, so a failed upload must
        // not lose the claim with it.
        proofPath = null;
      }
    }

    const { error } = await supabase
      .from("payments")
      .update({
        status: "claimed",
        utr,
        claimed_at: new Date().toISOString(),
        ...(proofPath ? { proof_path: proofPath } : {}),
      })
      .eq("id", open.id)
      .eq("status", "awaiting_payment");

    if (error) {
      // payments_utr_live_idx: this transaction ID is already on a payment we
      // are checking or have already honoured. Usually a copy-paste slip;
      // occasionally someone trying to buy two plans with one payment. Either
      // way the operator should know it happened.
      if (error.code === "23505") {
        log.warn("duplicate UPI transaction ID", {
          detail: `utr=${utr} ref=${open.reference} user=${user.id}`,
        });
        return {
          error:
            "That transaction ID is already recorded against another payment. Check you've " +
            "copied the right one from your receipt — if you're sure it's correct, get in " +
            "touch and we'll sort it out.",
        };
      }
      log.error("claim payment failed", { detail: error.message, userId: user.id });
      return { error: "Couldn't record that. Try again in a moment." };
    }

    log.info("payment claimed", { detail: `ref=${open.reference} user=${user.id}` });
    revalidatePath("/dashboard/billing");
    revalidatePath("/admin/payments");
    return { error: null, success: true };
  } catch (err) {
    return { error: toActionErrorMessage(err, "claim-payment") };
  }
}

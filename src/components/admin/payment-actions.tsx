"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { adminDecidePaymentAction } from "@/lib/actions/admin";

/**
 * Approve or reject one UPI claim.
 *
 * Rejection opens an inline reason box rather than a window.confirm/prompt:
 * the reason is shown to the trader on their billing page, so "no" without a
 * sentence is a support ticket waiting to happen — and a native dialog blocks
 * the page while someone types one.
 */
export function PaymentDecision({ id, reference }: { id: string; reference: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  function decide(decision: "approve" | "reject", note?: string) {
    startTransition(async () => {
      const r = await adminDecidePaymentAction(id, decision, note);
      if (r.error) toast.error(r.error);
      else toast.success(decision === "approve" ? `${reference} approved` : `${reference} rejected`);
      setRejecting(false);
      setReason("");
      router.refresh();
    });
  }

  if (rejecting) {
    return (
      <div className="flex min-w-56 flex-col gap-1.5">
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why? e.g. no credit found for this ID"
          className="rounded border px-2 py-1 text-xs"
        />
        <div className="flex gap-1.5">
          <button
            disabled={pending || !reason.trim()}
            onClick={() => decide("reject", reason)}
            className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-600 disabled:opacity-50"
          >
            {pending ? "…" : "Confirm reject"}
          </button>
          <button
            disabled={pending}
            onClick={() => setRejecting(false)}
            className="rounded border px-2 py-1 text-xs hover:bg-muted/60"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-1.5">
      <button
        disabled={pending}
        onClick={() => decide("approve")}
        className="whitespace-nowrap rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-600 disabled:opacity-50"
      >
        {pending ? "…" : "Approve"}
      </button>
      <button
        disabled={pending}
        onClick={() => setRejecting(true)}
        className="whitespace-nowrap rounded border px-2 py-1 text-xs hover:bg-muted/60 disabled:opacity-50"
      >
        Reject
      </button>
    </div>
  );
}

"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import {
  cancelPaymentAction,
  claimPaymentAction,
  startPaymentAction,
  type BillingActionState,
} from "@/lib/actions/billing";
import { formatInr, type Period } from "@/lib/billing/plans";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The interactive parts of the billing page. The QR itself is rendered on the
 * server — it is an SVG string, it never changes once the amount is fixed, and
 * drawing it in the browser would mean shipping a QR encoder to every visitor.
 */

export function PeriodChooser({
  periods,
  selected,
}: {
  periods: Period[];
  selected: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {periods.map((period) => {
        const isSelected = selected === period.months;
        return (
          <button
            key={period.months}
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await startPaymentAction(period.months);
                if (r.error) toast.error(r.error);
                router.refresh();
              })
            }
            className={`rounded-lg border p-4 text-left transition-colors disabled:opacity-50 ${
              isSelected ? "border-primary bg-primary/10" : "hover:bg-muted/50"
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{period.label}</span>
              {period.saving ? (
                <span className="text-xs text-primary">{period.saving}</span>
              ) : null}
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">
              {formatInr(period.amountInr)}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {formatInr(Math.round(period.amountInr / period.months))} a month
            </div>
          </button>
        );
      })}
    </div>
  );
}

const initialState: BillingActionState = { error: null };

export function ClaimForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(claimPaymentAction, initialState);

  // In an effect, not in render: once the claim lands the whole page is in a
  // different state (waiting for confirmation) and the server is what knows
  // it, but refreshing during render is a side effect in the render path.
  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="utr">UPI transaction ID</Label>
        <Input
          id="utr"
          name="utr"
          inputMode="numeric"
          autoComplete="off"
          placeholder="12 digits, e.g. 418372916455"
          required
        />
        <p className="text-xs text-muted-foreground">
          In Google Pay, open the payment and look for &ldquo;UPI transaction ID&rdquo;. It is the
          number we search for to find your money.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="proof">
          Screenshot <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="proof"
          name="proof"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
        />
        <p className="text-xs text-muted-foreground">
          The payment receipt, if you have it handy. JPEG, PNG or WebP, under 5MB.
        </p>
      </div>

      {state.error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? <Loader2 className="animate-spin" /> : <Upload />}
        {pending ? "Sending…" : "I've paid — send for confirmation"}
      </Button>
    </form>
  );
}

export function CancelPaymentButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await cancelPaymentAction();
          if (r.error) toast.error(r.error);
          router.refresh();
        })
      }
      className="text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
    >
      {pending ? "Cancelling…" : "Cancel this payment"}
    </button>
  );
}

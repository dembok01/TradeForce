import { Clock, QrCode, Landmark } from "lucide-react";
import type { Payment } from "@/lib/data/billing";
import { PERIODS, formatInr, periodFor } from "@/lib/billing/plans";
import { payee } from "@/lib/billing/payee";
import { buildUpiUri } from "@/lib/billing/upi";
import { upiQrSvg } from "@/lib/billing/qr";
import { ClaimForm, PeriodChooser, CancelPaymentButton } from "@/components/dashboard/billing-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Paying, in whatever state the exchange is currently in.
 *
 * Shared by /dashboard/billing and /pay. They are two places a trader can be
 * standing — inside the product, or stopped at the gate before it — and the
 * payment itself must behave identically in both, down to the reference in the
 * QR. One component is the only way to be sure of that.
 *
 * Server-rendered because the QR is: it is an SVG string built from a row we
 * created, it never changes once the amount is fixed, and encoding it in the
 * browser would mean shipping a QR encoder to every visitor.
 */
export function PaymentCard({
  open,
  entitlementActive,
  className,
}: {
  open: Payment | null;
  entitlementActive: boolean;
  className?: string;
}) {
  const destination = payee();
  const period = open ? periodFor(open.months) : null;

  // Only ever built from a row we created, with an amount from our own price
  // list — never from anything a trader can type.
  const uri =
    destination && open && open.status === "awaiting_payment"
      ? buildUpiUri({
          vpa: destination.vpa,
          name: destination.name,
          amountInr: Number(open.amount_inr),
          reference: open.reference,
        })
      : null;

  if (!destination) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Payments aren&apos;t set up yet</CardTitle>
          <CardDescription>
            The payment details haven&apos;t been configured on this deployment, so there is
            nothing to pay into. Get in touch and we&apos;ll sort it out directly.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (open?.status === "claimed") {
    return (
      <Card className={cn("border-amber-500/40", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-4 text-amber-500" />
            We&apos;re checking your payment
          </CardTitle>
          <CardDescription>
            Reference <span className="font-mono">{open.reference}</span> ·{" "}
            {formatInr(Number(open.amount_inr))} for {open.months} month
            {open.months === 1 ? "" : "s"} · transaction{" "}
            <span className="font-mono">{open.utr}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Someone matches this against the account by hand, usually the same day. Your access
            starts the moment it&apos;s confirmed, and we&apos;ll email you when it is.
          </p>
          <p>
            Nothing else is needed from you. You can close this page — the confirmation email
            goes to the address you signed up with.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (open && uri) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="size-4" />
            Pay {formatInr(Number(open.amount_inr))} for {period?.label ?? `${open.months} months`}
          </CardTitle>
          <CardDescription>
            Scan with any UPI app, or tap to pay on this phone. The reference{" "}
            <span className="font-mono">{open.reference}</span> is already in the payment note —
            leave it there so we can find your money.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="shrink-0">
              <div
                className="w-44 rounded-lg bg-white p-3"
                // Generated server-side by the QR encoder from a URI we built
                // ourselves; no user input reaches it.
                dangerouslySetInnerHTML={{ __html: upiQrSvg(uri) }}
              />
              <a
                href={uri}
                className="mt-3 block rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground sm:hidden"
              >
                Pay with a UPI app
              </a>
            </div>

            <div className="min-w-0 flex-1 space-y-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">UPI ID</div>
                <div className="break-all font-mono">{destination.vpa}</div>
                <div className="text-xs text-muted-foreground">{destination.name}</div>
              </div>
              {destination.bank ? (
                <div>
                  <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                    <Landmark className="size-3" /> Bank transfer instead
                  </div>
                  <dl className="mt-1 space-y-0.5 text-xs">
                    <div className="flex gap-2">
                      <dt className="w-24 shrink-0 text-muted-foreground">Account</dt>
                      <dd className="break-all font-mono">{destination.bank.accountNumber}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-24 shrink-0 text-muted-foreground">IFSC</dt>
                      <dd className="font-mono">{destination.bank.ifsc}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-24 shrink-0 text-muted-foreground">Name</dt>
                      <dd className="break-words">{destination.bank.accountName}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-24 shrink-0 text-muted-foreground">Bank</dt>
                      <dd>{destination.bank.bankName}</dd>
                    </div>
                  </dl>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Put <span className="font-mono">{open.reference}</span> in the transfer
                    remarks.
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="border-t pt-6">
            <ClaimForm />
          </div>

          <div className="border-t pt-4">
            <p className="mb-3 text-xs text-muted-foreground">
              Wrong length? Pick another and the amount updates.
            </p>
            <PeriodChooser periods={PERIODS} selected={open.months} />
            <div className="mt-3">
              <CancelPaymentButton />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{entitlementActive ? "Add more time" : "Choose how long you want"}</CardTitle>
        <CardDescription>
          Longer periods cost less per month. Paying while a period is still running adds to it
          rather than replacing it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PeriodChooser periods={PERIODS} selected={null} />
      </CardContent>
    </Card>
  );
}

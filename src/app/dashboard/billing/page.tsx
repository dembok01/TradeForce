import { CheckCircle2, Clock, QrCode, Landmark, XCircle } from "lucide-react";
import { getEntitlement, getMyPayments, getOpenPayment, type Payment } from "@/lib/data/billing";
import { PERIODS, formatInr, periodFor, DISPLAY_PRICE_USD } from "@/lib/billing/plans";
import { payee } from "@/lib/billing/payee";
import { buildUpiUri } from "@/lib/billing/upi";
import { upiQrSvg } from "@/lib/billing/qr";
import { PageHeader } from "@/components/dashboard/page-header";
import { ClaimForm, PeriodChooser, CancelPaymentButton } from "@/components/dashboard/billing-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

/**
 * Paying for TradeForce by UPI.
 *
 * There is no payment gateway, so there is no webhook and no automatic
 * confirmation: a trader pays, tells us the transaction ID, and an operator
 * matches it in GPay. The page's job is to make every state of that exchange
 * legible — what to pay, that we are checking, and what happened — because the
 * one thing worse than waiting is paying and not knowing.
 */

const STATUS: Record<
  Payment["status"],
  { label: string; variant: "success" | "warning" | "destructive" | "secondary" }
> = {
  awaiting_payment: { label: "Not paid yet", variant: "secondary" },
  claimed: { label: "Checking", variant: "warning" },
  approved: { label: "Confirmed", variant: "success" },
  rejected: { label: "Not matched", variant: "destructive" },
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function BillingPage() {
  const [entitlement, open, history] = await Promise.all([
    getEntitlement(),
    getOpenPayment(),
    getMyPayments(),
  ]);
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

  return (
    <div>
      <PageHeader
        eyebrow="Your plan"
        title="Billing"
        description={`TradeForce is $${DISPLAY_PRICE_USD} a month, charged in rupees by UPI. Card payments are coming; until then an operator confirms each payment by hand.`}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Current plan
              <Badge variant={entitlement.active ? "success" : "secondary"}>
                {entitlement.active ? "Paid" : "Free"}
              </Badge>
            </CardTitle>
            <CardDescription>
              {entitlement.active
                ? `Runs until ${fmtDate(entitlement.expiresAt?.toISOString() ?? null)} — ${entitlement.daysLeft} day${entitlement.daysLeft === 1 ? "" : "s"} left.`
                : entitlement.expiresAt
                  ? `Your paid period ended on ${fmtDate(entitlement.expiresAt.toISOString())}.`
                  : "The full rule set, on one account, at no charge."}
            </CardDescription>
          </CardHeader>
          {entitlement.active && entitlement.daysLeft !== null && entitlement.daysLeft <= 7 ? (
            <CardContent>
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                Renewing before {fmtDate(entitlement.expiresAt?.toISOString() ?? null)} adds to the
                days you already have — you lose nothing by paying early.
              </p>
            </CardContent>
          ) : null}
        </Card>

        <Card className="lg:col-span-2">
          {!destination ? (
            <CardHeader>
              <CardTitle>Payments aren&apos;t set up yet</CardTitle>
              <CardDescription>
                The payment details haven&apos;t been configured on this deployment, so there is
                nothing to pay into. Get in touch and we&apos;ll sort it out directly.
              </CardDescription>
            </CardHeader>
          ) : open?.status === "claimed" ? (
            <>
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
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Someone matches this against the account by hand, usually the same day. Your plan
                  starts the moment it&apos;s confirmed, and this page will say so.
                </p>
              </CardContent>
            </>
          ) : open && uri ? (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="size-4" />
                  Pay {formatInr(Number(open.amount_inr))} for{" "}
                  {period?.label ?? `${open.months} months`}
                </CardTitle>
                <CardDescription>
                  Scan with any UPI app, or tap to pay on this phone. The reference{" "}
                  <span className="font-mono">{open.reference}</span> is already in the payment note
                  — leave it there so we can find your money.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                  <div className="shrink-0">
                    <div
                      className="w-44 rounded-lg bg-white p-3"
                      // Generated server-side by the QR encoder from a URI we
                      // built ourselves; no user input reaches it.
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
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        UPI ID
                      </div>
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
                            <dd className="break-all font-mono">
                              {destination.bank.accountNumber}
                            </dd>
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
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle>
                  {entitlement.active ? "Add more time" : "Choose how long you want"}
                </CardTitle>
                <CardDescription>
                  Longer periods cost less per month. Paying while a period is still running adds
                  to it rather than replacing it.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PeriodChooser periods={PERIODS} selected={null} />
              </CardContent>
            </>
          )}
        </Card>
      </div>

      {history.length > 0 ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Payment history</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {["Started", "Reference", "Period", "Amount", "Status"].map((c) => (
                    <th key={c} className="whitespace-nowrap px-4 py-2 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap px-4 py-2">{fmtDate(p.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{p.reference}</td>
                    <td className="whitespace-nowrap px-4 py-2">
                      {p.months} month{p.months === 1 ? "" : "s"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                      {formatInr(Number(p.amount_inr))}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={STATUS[p.status].variant}>{STATUS[p.status].label}</Badge>
                      {p.status === "rejected" && p.note ? (
                        <div className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                          <XCircle className="mt-0.5 size-3 shrink-0" />
                          <span>{p.note}</span>
                        </div>
                      ) : null}
                      {p.status === "approved" ? (
                        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <CheckCircle2 className="size-3" /> {fmtDate(p.decided_at)}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

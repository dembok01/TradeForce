import { CheckCircle2, XCircle } from "lucide-react";
import { getEntitlement, getMyPayments, getOpenPayment, type Payment } from "@/lib/data/billing";
import { formatInr, DISPLAY_PRICE_USD } from "@/lib/billing/plans";
import { PageHeader } from "@/components/dashboard/page-header";
import { PaymentCard } from "@/components/billing/payment-card";
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
                {entitlement.active ? "Active" : "No plan"}
              </Badge>
            </CardTitle>
            <CardDescription>
              {entitlement.active
                ? `Runs until ${fmtDate(entitlement.expiresAt?.toISOString() ?? null)} — ${entitlement.daysLeft} day${entitlement.daysLeft === 1 ? "" : "s"} left.`
                : entitlement.expiresAt
                  ? `Your paid period ended on ${fmtDate(entitlement.expiresAt.toISOString())}.`
                  : "Choose a plan to unlock your dashboard and connect MT5."}
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

        <PaymentCard
          open={open}
          entitlementActive={entitlement.active}
          className="lg:col-span-2"
        />
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

import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Check, ShieldCheck } from "lucide-react";
import { getAuthedUser } from "@/lib/data/auth";
import { getEntitlement, getOpenPayment } from "@/lib/data/billing";
import { DISPLAY_PRICE_USD, PERIODS, formatInr } from "@/lib/billing/plans";
import { PaymentCard } from "@/components/billing/payment-card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Get access · TradeForce",
  description: "Choose how long you want, pay by UPI, and start enforcing your rules.",
};

/**
 * The payment page, and nothing else. Every buy button and every lock in the
 * dashboard points here.
 *
 * Signed out goes to signup, which lands on the locked dashboard: a new
 * account always sees the product first, and comes back here from a lock.
 */

const INCLUDED = [
  "MT5 connected: our hosted terminal or the EA on your own",
  "Every rule enforced live in the terminal",
  "Journal, violation centre and discipline score",
  "Your EA key, issued when your payment is confirmed",
];

export default async function PayPage() {
  const user = await getAuthedUser();
  if (!user) redirect("/signup");

  const [entitlement, open] = await Promise.all([getEntitlement(), getOpenPayment()]);

  // Already paid and nothing in flight: there is nothing for this page to do,
  // and billing is where adding more time belongs.
  if (entitlement.active && !open) redirect("/dashboard/billing");

  const cheapest = PERIODS.reduce((a, b) =>
    a.amountInr / a.months <= b.amountInr / b.months ? a : b
  );

  return (
    <main className="min-h-screen bg-obsidian">
      <div className="mx-auto max-w-5xl px-6 py-14 sm:py-20">
        <Link href="/" className="font-display text-lg font-semibold tracking-tight">
          Trade<span className="text-gradient-gold">Force</span>
        </Link>

        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-12">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary/80">
              Choose a plan
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {entitlement.expiresAt && !entitlement.active
                ? "Your plan has ended."
                : "Unlock TradeForce."}
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              ${DISPLAY_PRICE_USD} a month, paid in rupees by UPI. {formatInr(PERIODS[0].amountInr)}{" "}
              for a month, down to {formatInr(Math.round(cheapest.amountInr / cheapest.months))} a
              month on twelve.
            </p>

            <ul className="mt-8 space-y-3.5">
              {INCLUDED.map((line) => (
                <li key={line} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  <span className="text-muted-foreground">{line}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 rounded-lg border border-border/60 bg-card/40 p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="size-4 text-primary" aria-hidden />
                Confirmed by a person
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                You pay by UPI and we match it to your account by hand, usually the same day. We
                email you the moment it is confirmed.
              </p>
            </div>
          </div>

          <div>
            <PaymentCard open={open} entitlementActive={entitlement.active} />
            <p className="mt-6 text-xs text-muted-foreground">
              Prepaid, no auto renewal, not refundable.{" "}
              <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
                Terms of Service
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

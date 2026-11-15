import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { getAuthedUser } from "@/lib/data/auth";
import { getEntitlement, getOpenPayment } from "@/lib/data/billing";
import { DISPLAY_PRICE_USD, PERIODS, formatInr } from "@/lib/billing/plans";
import { PaymentCard } from "@/components/billing/payment-card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Get access — TradeForce",
  description: "Choose how long you want, pay by UPI, and start enforcing your charter.",
};

/**
 * The gate.
 *
 * Every buy button on the landing page points here, and this page is outside
 * /dashboard on purpose: a trader who has just signed up has no charter yet,
 * and the dashboard layout would bounce them to onboarding before they ever
 * saw a QR code. Paying has to come first because that is the order the client
 * asked for — sign up, pay, then set your rules while we check the payment.
 *
 * Not signed in sends them to signup rather than login, because that is the
 * commoner case from a buy button; signup carries them straight back here.
 */

/**
 * What the plan includes — the first three are what paying actually adds, and
 * the note under the list says so. The dashboard and the journal are free, and
 * a list that implied otherwise would be the first thing a trader found out we
 * had overstated.
 */
const INCLUDED = [
  "Rule enforcement inside MetaTrader — the trade is stopped, not logged",
  "Hosted terminal, so your rules hold with your computer switched off",
  "Your EA API key, issued the moment your payment is confirmed",
  "Full violation history and discipline score",
  "Trade journal, session analytics and P/L history",
];

export default async function PayPage() {
  const user = await getAuthedUser();
  if (!user) redirect("/signup?next=/pay");

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
              Get access
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {entitlement.expiresAt && !entitlement.active
                ? "Your plan has run out."
                : "One charter, held for you."}
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              ${DISPLAY_PRICE_USD} a month, charged in rupees — {formatInr(PERIODS[0].amountInr)} for
              a month, down to {formatInr(Math.round(cheapest.amountInr / cheapest.months))} a month
              on twelve.
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

            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
              The dashboard, your charter and the journal are free and stay free. The first three
              above are what paying adds.
            </p>

            <div className="mt-8 rounded-lg border border-border/60 bg-card/40 p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="size-4 text-primary" aria-hidden />
                Checked by a person, not a gateway
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                We don&apos;t have a card gateway yet, so you pay by UPI and someone here matches
                it against the account by hand — usually the same day. You&apos;ll get an email
                the moment it&apos;s confirmed.
              </p>
            </div>
          </div>

          <div>
            <PaymentCard open={open} entitlementActive={entitlement.active} />

            {/* The way out. Without it, anyone who signs up from a buy button
                and then thinks better of it is stranded on a payment page. */}
            <p className="mt-6 text-xs text-muted-foreground">
              Not ready?{" "}
              <Link href="/onboarding" className="underline underline-offset-2 hover:text-foreground">
                Set up your charter and look around first
              </Link>{" "}
              — the dashboard is yours either way. Enforcement, the hosted terminal and your EA key
              start when a payment is confirmed.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <Link href="/terms" className="hover:text-foreground">
                Terms of Service
              </Link>
              <Link href="/dashboard" className="inline-flex items-center gap-1 hover:text-foreground">
                Go to dashboard
                <ArrowRight className="size-3" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

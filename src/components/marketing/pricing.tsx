import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Section } from "@/components/marketing/section";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { PERIODS, formatInr, DISPLAY_PRICE_USD } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

/**
 * One plan, three lengths.
 *
 * The old two-card layout advertised a "$0 forever" tier beside the paid one.
 * That tier is gone from this page on the client's instruction: the free
 * account still exists and is still reachable, but from the footer rather than
 * from a card that competes with the thing being sold.
 *
 * Prices come from lib/billing/plans.ts, the same constant the UPI QR is built
 * from, so the figure on this page is the figure that gets charged. The dollar
 * number is the brand price; rupees are what moves.
 */
const INCLUDED = [
  "Rule enforcement inside MetaTrader — the trade is stopped, not logged after the fact",
  "Hosted cloud terminal, so your charter holds with your computer switched off",
  "Daily loss, trade count, open positions, risk per trade and session windows",
  "Full violation centre, discipline score and analytics",
  "Trade journal, session history and P/L record",
  "EA API key for your own MetaTrader, for funded and challenge accounts",
];

// The 12-month card is the one to take, and the one that costs us least to
// service: every payment here is approved by a human.
const FEATURED_MONTHS = 12;

export function Pricing() {
  return (
    <Section
      id="pricing"
      eyebrow="Pricing"
      title="One plan. Pick how long."
      description={`$${DISPLAY_PRICE_USD} a month, charged in rupees by UPI — longer periods cost less per month. Cards are coming; until then each payment is confirmed by a person before your access starts.`}
    >
      <div className="grid gap-4 md:grid-cols-3">
        {PERIODS.map((period, i) => {
          const featured = period.months === FEATURED_MONTHS;
          return (
            <Reveal key={period.months} y={48} delay={0.08 * i}>
              <div
                className={cn(
                  "relative flex h-full flex-col rounded-card border p-7 sm:p-8",
                  featured ? "border-primary/40 bg-card glow-gold" : "border-border bg-card/60"
                )}
              >
                {period.saving && (
                  <span className="eyebrow absolute -top-3 right-7 bg-obsidian">
                    {period.saving}
                  </span>
                )}
                <h3 className="text-lg font-medium tracking-[-0.03em]">{period.label}</h3>
                <div className="mt-5 flex items-baseline gap-1.5 font-mono-tabular">
                  <span className="text-4xl font-medium tracking-[-0.04em]">
                    {formatInr(period.amountInr)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {formatInr(Math.round(period.amountInr / period.months))} a month
                  {period.months > 1 ? ", paid once" : ""}
                </p>
                <Button
                  variant={featured ? "gold" : "outline"}
                  size="lg"
                  className="mt-7 rounded-full"
                  asChild
                >
                  <Link href="/pay">
                    Get access
                    <ArrowRight />
                  </Link>
                </Button>
              </div>
            </Reveal>
          );
        })}
      </div>

      <Reveal y={32} delay={0.3}>
        <div className="mt-4 rounded-card border border-border bg-card/40 p-7 sm:p-9">
          <h3 className="text-base font-medium tracking-[-0.02em]">
            Every plan is the whole product
          </h3>
          <ul className="mt-6 grid gap-3.5 sm:grid-cols-2">
            {INCLUDED.map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                <span className="text-muted-foreground">{feature}</span>
              </li>
            ))}
          </ul>
          <p className="mt-7 text-xs leading-relaxed text-muted-foreground">
            Periods are prepaid and don&apos;t auto-renew. Paying while a period is still running
            adds to it rather than replacing it. Payments are non-refundable — see the{" "}
            <Link href="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>
            .
          </p>
        </div>
      </Reveal>
    </Section>
  );
}

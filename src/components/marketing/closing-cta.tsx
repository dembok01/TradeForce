import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/reveal";
import { PERIODS, formatInr } from "@/lib/billing/plans";

/**
 * The reference's closing band: one line, one sub, one button, centred, with
 * the accent blooming behind it — the same bloom as the hero, so the page opens
 * and closes on the same note.
 */
export function ClosingCta() {
  // From the price list, not typed in: this line and the pricing cards above it
  // must never disagree about what TradeForce costs.
  const cheapest = PERIODS.reduce((a, b) =>
    a.amountInr / a.months <= b.amountInr / b.months ? a : b
  );
  const perMonth = formatInr(Math.round(cheapest.amountInr / cheapest.months));

  return (
    <section className="border-t border-border/60 bg-obsidian py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal y={48}>
          <div className="bloom-gold">
            <div className="relative z-10 mx-auto max-w-2xl text-center">
              <h2 className="type-h2">The next breach is the one that costs you.</h2>
              <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
                Set your rules once. From {perMonth} a month, paid{" "}
                {cheapest.label.toLowerCase()} at a time.
              </p>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <Button variant="gold" size="lg" className="rounded-full" asChild>
                  <Link href="/pay">Get access</Link>
                </Button>
                <Button variant="secondary" size="lg" className="rounded-full" asChild>
                  <a href="#contact">Talk to us</a>
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

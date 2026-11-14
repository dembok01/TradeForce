import Link from "next/link";
import { Check } from "lucide-react";
import { Section } from "@/components/marketing/section";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * No monthly/yearly toggle. The reference has one; the period chooser lives on
 * the billing page instead, where it can show the rupee amounts that are
 * actually charged (₹1,249 / ₹3,399 / ₹11,999). A toggle here would have to
 * restate them in dollars and the two would drift.
 *
 * Prices are in dollars because the brand is, and charged in rupees because
 * UPI is: see lib/billing/plans.ts, which holds both so they cannot disagree.
 *
 * The paid tier's list is what the plan is FOR, not what is currently withheld
 * from the free tier — nothing is gated yet. See the payments design doc.
 */
const PLANS = [
  {
    name: "Discipline",
    price: "$0",
    period: "forever",
    description:
      "One account, the full rule set. For traders proving the system to themselves first.",
    features: [
      "1 trading account",
      "All rule enforcement provisions",
      "Trade journal & manual entry",
      "7-day P/L history",
    ],
    cta: "Start free",
    featured: false,
  },
  {
    name: "Funded",
    price: "$13",
    period: "/month",
    description: "For evaluation and funded accounts where a breach costs a payout.",
    features: [
      "Everything in Discipline",
      "Hosted cloud terminal — enforced with your computer off",
      "Full violation centre & history",
      "Discipline score & analytics",
      "EA API key issuance",
      "Priority support",
    ],
    cta: "Start enforcing discipline",
    featured: true,
  },
];

export function Pricing() {
  return (
    <Section
      id="pricing"
      eyebrow="Pricing"
      title="One rule set. Two ways to run it."
      description="Paid by UPI from your dashboard — ₹1,249 a month, less on a longer period. Cards are coming; until then each payment is confirmed by a human before your plan starts."
    >
      <div className="grid gap-4 md:grid-cols-2">
        {PLANS.map((plan, i) => (
          <Reveal key={plan.name} y={48} delay={0.08 * i}>
            <div
              className={cn(
                "relative flex h-full flex-col rounded-card border p-8 sm:p-9",
                plan.featured ? "border-primary/40 bg-card glow-gold" : "border-border bg-card/60"
              )}
            >
              {plan.featured && (
                <span className="eyebrow absolute -top-3 right-8 bg-obsidian">Popular</span>
              )}
              <h3 className="text-xl font-medium tracking-[-0.03em]">{plan.name}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                {plan.description}
              </p>
              <div className="mt-7 flex items-baseline gap-1.5 font-mono-tabular">
                <span className="text-5xl font-medium tracking-[-0.04em]">{plan.price}</span>
                <span className="text-sm text-muted-foreground">{plan.period}</span>
              </div>
              <ul className="mt-8 flex-1 space-y-3.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                variant={plan.featured ? "gold" : "outline"}
                size="lg"
                className="mt-9 rounded-full"
                asChild
              >
                <Link href="/signup">{plan.cta}</Link>
              </Button>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

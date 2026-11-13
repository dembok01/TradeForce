import Link from "next/link";
import { Check } from "lucide-react";
import { Section } from "@/components/marketing/section";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * No monthly/yearly toggle. The reference has one, but there is no yearly price
 * and no Stripe — both CTAs link to /signup — so a toggle implying an annual
 * discount would be an invented commercial term. Dropped on the client's call
 * and recorded as a deliberate deviation in the spec.
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
    price: "$29",
    period: "/month",
    description: "For evaluation and funded accounts where a breach costs a payout.",
    features: [
      "Up to 5 trading accounts",
      "All rule enforcement provisions",
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
      description="Card payments are not connected yet, so both buttons take you to sign-up and nothing is charged today."
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

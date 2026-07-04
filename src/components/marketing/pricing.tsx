import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    name: "Discipline",
    price: "$0",
    period: "forever",
    description: "One account, the full rule set. For traders proving the system to themselves first.",
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
    <section id="pricing" className="border-t border-border/60 bg-obsidian py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-14 max-w-2xl">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-primary/80">
            Pricing
          </p>
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            One rule set. Two ways to run it.
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "relative flex flex-col rounded-xl border p-8",
                plan.featured
                  ? "border-primary/40 bg-card border-gold-glow"
                  : "border-border bg-card/60"
              )}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-8 rounded-full border border-primary/40 bg-obsidian px-3 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-primary">
                  For funded traders
                </span>
              )}
              <h3 className="font-display text-xl font-medium">{plan.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
              <div className="mt-6 flex items-baseline gap-1 font-mono-tabular">
                <span className="font-display text-4xl font-semibold">{plan.price}</span>
                <span className="text-sm text-muted-foreground">{plan.period}</span>
              </div>
              <ul className="mt-8 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2.5} />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                variant={plan.featured ? "gold" : "outline"}
                size="lg"
                className="mt-8"
                asChild
              >
                <Link href="/signup">{plan.cta}</Link>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

import { CalendarClock, FileWarning, NotebookPen, ShieldCheck, Target, TrendingUp } from "lucide-react";
import { Section } from "@/components/marketing/section";
import { Reveal } from "@/components/motion/reveal";

/**
 * The six charter provisions. Titles and descriptions are unchanged from the
 * hairline-ledger version — the spec keeps the content and changes only the
 * presentation, from Roman-numeral rules to the reference's icon-card grid.
 */
const PROVISIONS = [
  {
    icon: ShieldCheck,
    title: "Real-time rule enforcement",
    description:
      "Set a daily loss limit, a max trade count, a position cap, and a risk-per-trade ceiling. TradeForce checks every order against them before it's allowed to stand.",
  },
  {
    icon: CalendarClock,
    title: "Session control",
    description:
      "Restrict trading to London, New York, Asian, or the London/NY overlap — or draw a custom window in your own timezone. Outside it, the account stays flat.",
  },
  {
    icon: FileWarning,
    title: "Violation centre",
    description:
      "Every breach is logged with a timestamp and the trade that caused it — overtrading, outside-session attempts, loss and exposure breaches — tallied weekly and monthly.",
  },
  {
    icon: Target,
    title: "Discipline score",
    description:
      "A single number out of 100, recomputed daily from four factors: rule adherence, session adherence, overtrading prevention, and risk management.",
  },
  {
    icon: NotebookPen,
    title: "Trade journal",
    description:
      "Every trade — symbol, direction, entry, exit, P/L, time — with a notes field for what actually happened. Filter by date range in seconds.",
  },
  {
    icon: TrendingUp,
    title: "Performance analytics",
    description:
      "Win rate, trade volume by week and month, and P/L charted daily, weekly, and monthly — the record your discipline is actually producing.",
  },
];

export function CharterFeatures() {
  return (
    <Section
      id="features"
      eyebrow="The Charter"
      title="Six provisions. No exceptions."
      description="Everything TradeForce does for a funded account, written down the way a trading plan should be — plainly, and in order."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PROVISIONS.map((provision, i) => (
          <Reveal key={provision.title} y={48} delay={0.05 * i}>
            <div className="flex h-full flex-col rounded-card border border-border bg-card p-7">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-tile bg-primary/10 text-primary">
                <provision.icon className="size-5" strokeWidth={1.75} />
              </span>
              <h3 className="mt-6 text-lg font-medium tracking-[-0.03em]">{provision.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {provision.description}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

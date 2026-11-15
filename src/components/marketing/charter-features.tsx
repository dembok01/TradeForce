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
    title: "Live rule enforcement",
    description: "Loss, trades, positions, risk.",
  },
  {
    icon: CalendarClock,
    title: "Session control",
    description: "London, New York, Asia or custom.",
  },
  {
    icon: FileWarning,
    title: "Violation centre",
    description: "Every breach, with the trade behind it.",
  },
  {
    icon: Target,
    title: "Discipline score",
    description: "One number out of 100, daily.",
  },
  {
    icon: NotebookPen,
    title: "Trade journal",
    description: "Every trade, with your notes.",
  },
  {
    icon: TrendingUp,
    title: "Performance analytics",
    description: "Win rate and P/L, day to month.",
  },
];

export function CharterFeatures() {
  return (
    <Section
      id="features"
      eyebrow="The Charter"
      title="Six provisions. No exceptions."
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

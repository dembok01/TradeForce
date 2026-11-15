import { Section } from "@/components/marketing/section";
import { Reveal } from "@/components/motion/reveal";
import { STEPS } from "@/lib/marketing/content";

/** Each step is shown, not described: the connection, the rules, the result. */
const RULES = ["Loss $400", "Trades 5", "Risk 1%", "08:00 to 17:00"];

function Connected() {
  return (
    <div className="flex items-center gap-2.5 rounded-tile border border-border bg-background/60 px-4 py-3">
      <span className="relative flex size-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
      <span className="text-sm">MT5 connected</span>
      <span className="font-mono-tabular ml-auto text-xs text-muted-foreground">#2084912</span>
    </div>
  );
}

function Rules() {
  return (
    <div className="flex flex-wrap gap-2">
      {RULES.map((rule) => (
        <span
          key={rule}
          className="font-mono-tabular rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-primary"
        >
          {rule}
        </span>
      ))}
    </div>
  );
}

function Result() {
  return (
    <ul className="font-mono-tabular space-y-2 text-xs">
      <li className="flex items-center gap-2.5 rounded-tile border border-border bg-background/60 px-4 py-2.5">
        <span className="size-1.5 rounded-full bg-success" />
        <span>XAUUSD LONG</span>
        <span className="ml-auto text-success">+$168.20</span>
      </li>
      <li className="flex items-center gap-2.5 rounded-tile border border-destructive/30 bg-destructive/5 px-4 py-2.5">
        <span className="size-1.5 rounded-full bg-destructive" />
        <span className="text-destructive">Trade #6</span>
        <span className="ml-auto text-muted-foreground">closed</span>
      </li>
    </ul>
  );
}

const VISUAL: Record<string, () => React.JSX.Element> = { "01": Connected, "02": Rules, "03": Result };

export function HowItWorks() {
  return (
    <Section id="how" eyebrow="How it works" title="Three steps. Then it holds the line.">
      <div className="grid gap-4 md:grid-cols-3">
        {STEPS.map((step, i) => {
          const Visual = VISUAL[step.n];
          return (
            <Reveal key={step.n} y={48} delay={0.06 * i}>
              <div className="flex h-full flex-col rounded-card border border-border bg-card p-7">
                <span className="eyebrow self-start font-mono-tabular">{step.n}</span>
                <h3 className="mt-6 text-lg font-medium tracking-[-0.03em]">{step.title}</h3>
                <div className="mt-auto pt-7">
                  <Visual />
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}

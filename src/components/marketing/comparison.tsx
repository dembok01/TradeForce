import { Check, X } from "lucide-react";
import { Section } from "@/components/marketing/section";
import { Reveal } from "@/components/motion/reveal";
import { COMPARISON } from "@/lib/marketing/content";

/**
 * Two columns, as the reference has them: what traders use now, muted and
 * crossed out, against what the EA does, in the accent.
 *
 * On narrow screens the two columns stack rather than compressing into an
 * unreadable table — each side keeps its own heading so the stacked order
 * still reads as a comparison.
 */
export function Comparison() {
  return (
    <Section
      eyebrow="Why TradeForce"
      title="There is a difference between recording a rule and enforcing one."
      description="Everything else on a trader's desk finds out after the fact. This is the whole argument."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Reveal y={48}>
          <div className="h-full rounded-card border border-border bg-card/50 p-7 sm:p-9">
            <h3 className="text-lg font-medium tracking-[-0.03em] text-muted-foreground">
              Journals, spreadsheets, willpower
            </h3>
            <ul className="mt-7 space-y-4">
              {COMPARISON.map((row) => (
                <li key={row.them} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                    <X className="size-3" strokeWidth={2.5} />
                  </span>
                  <span className="text-muted-foreground">{row.them}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal y={48} delay={0.08}>
          <div className="h-full rounded-card border border-primary/30 bg-card p-7 sm:p-9">
            <h3 className="text-lg font-medium tracking-[-0.03em]">
              Trade<span className="text-gradient-gold">Force</span>
            </h3>
            <ul className="mt-7 space-y-4">
              {COMPARISON.map((row) => (
                <li key={row.us} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  <span className="text-foreground">{row.us}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

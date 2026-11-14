import { Reveal } from "@/components/motion/reveal";
import { Section } from "@/components/marketing/section";
import { RUNS_ON, RUNS_ON_LEAD, RUNS_ON_DISCLAIMER } from "@/lib/marketing/content";

/**
 * The compatibility strip: one platform claim, three firms named as issuers of
 * accounts it attaches to, and the disclaimer that keeps it honest.
 *
 * Wordmarks are set in our own typeface rather than the firms' logo files. Two
 * reasons, and the second is the one that matters: a logo lockup reads as a
 * partner badge whatever the caption says, and we hold no licence to
 * redistribute their marks. A monochrome row also survives a firm rebranding
 * and keeps every name at the same visual weight, which a mix of real logos
 * never does.
 *
 * The platform sits apart from the firms because it is a different kind of
 * statement: MetaTrader 5 is what the EA provably runs on, the firms are
 * context. See the RUNS_ON comment in content.ts for what is and is not
 * claimed here.
 */
export function RunsOn() {
  const platforms = RUNS_ON.filter((m) => m.kind === "platform");
  const firms = RUNS_ON.filter((m) => m.kind === "firm");

  return (
    <Section
      id="platform"
      eyebrow="Platform"
      title="It runs on MetaTrader 5"
      description={RUNS_ON_LEAD}
    >
      <Reveal y={48}>
        <div className="flex flex-col gap-8 rounded-sm border border-border/60 bg-card/30 p-8 sm:p-10">
          <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
            {platforms.map((m) => (
              <span
                key={m.name}
                className="font-display text-2xl font-medium tracking-[-0.03em] text-foreground"
              >
                {m.name}
              </span>
            ))}

            <span className="hidden h-8 w-px bg-border/80 sm:block" aria-hidden />

            <ul className="flex flex-wrap items-center gap-x-8 gap-y-4">
              {firms.map((m) => (
                <li
                  key={m.name}
                  className="font-display text-xl font-medium tracking-[-0.02em] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {m.name}
                </li>
              ))}
            </ul>
          </div>

          <p className="max-w-3xl border-t border-border/60 pt-6 text-xs leading-relaxed text-muted-foreground">
            {RUNS_ON_DISCLAIMER}
          </p>
        </div>
      </Reveal>
    </Section>
  );
}

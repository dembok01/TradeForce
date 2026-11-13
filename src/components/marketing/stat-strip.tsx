import { Reveal } from "@/components/motion/reveal";
import { STAT_STRIP } from "@/lib/marketing/content";

/**
 * Renders nothing while `STAT_STRIP` is empty — not an empty band, not a
 * heading with no numbers under it. The reference fills this slot with
 * "3k+ freelancers / $1.2M+ saved"; ours stays silent until the equivalent
 * figures are real.
 *
 * This is the hidden-section case that ships live, so the absence has to be
 * seamless: the section renders no wrapper at all, which means no border, no
 * padding and no gap between the sections either side of it.
 */
export function StatStrip() {
  if (STAT_STRIP.length === 0) return null;

  return (
    <section className="border-t border-border/60 bg-obsidian py-16">
      <div className="mx-auto max-w-6xl px-6">
        <dl className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STAT_STRIP.map((stat, i) => (
            <Reveal key={stat.label} y={48} delay={0.06 * i}>
              <dt className="font-mono-tabular text-4xl font-medium tracking-[-0.04em] text-foreground">
                {stat.value}
              </dt>
              <dd className="mt-2 text-sm text-muted-foreground">{stat.label}</dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}

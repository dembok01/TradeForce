import { AlertTriangle, Clock, Gauge } from "lucide-react";
import { Section } from "@/components/marketing/section";
import { Reveal } from "@/components/motion/reveal";
import { GovernorVisual } from "@/components/three/governor-visual";

/**
 * Four cells, each carrying a visual rather than a paragraph alone — a bento
 * whose cards are only text is just a card grid.
 *
 * The governor ring takes the square cell and fills it edge to edge:
 * `GovernorScene` is pointer-reactive inside an `aspect-square` wrapper, and
 * penned into a short band it reads as a gold sliver rather than a ring. The
 * other three cards are tuned around that square.
 *
 * The enforcement feed is deliberately absent: it is already in the hero frame
 * and again in the proof section, and a third copy on one page would spend its
 * impact.
 */

const FACTORS = [
  { label: "Rule adherence", pct: 96 },
  { label: "Session adherence", pct: 91 },
  { label: "Overtrading", pct: 88 },
  { label: "Risk management", pct: 94 },
];

const BREACHES = [
  { at: "14:43", kind: "Overtrading", detail: "Trade #6 of a 5-trade cap" },
  { at: "09:12", kind: "Outside session", detail: "Order 48m before London open" },
];

function Tile({ icon: Icon }: { icon: typeof Gauge }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-tile bg-primary/10 text-primary">
      <Icon className="size-5" strokeWidth={1.75} />
    </span>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`flex h-full flex-col rounded-card border border-border bg-card p-7 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

export function Bento() {
  return (
    <Section
      eyebrow="What you get"
      title="See the account the way the rules see it."
      description="The dashboard shows what the EA is enforcing right now — not a report you read once the month is over."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {/* Square cell: the ring fills it, the caption sits over a scrim. */}
        <Reveal y={48}>
          <div className="relative flex aspect-square flex-col overflow-hidden rounded-card border border-border bg-card">
            {/* The ring gets its own band rather than sitting under a scrim: the
                rim renders edge-on (the tori carry rotation=[π/2,0,0]) so it
                reads as a thin horizontal line through the vertical centre —
                exactly where a bottom gradient would hide it. */}
            <div className="relative min-h-0 flex-1">
              <GovernorVisual className="absolute inset-0" />
            </div>
            <div className="relative p-7 pt-0">
              <h3 className="text-lg font-medium tracking-[-0.03em]">
                Real-time rule enforcement
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Every order checked against your charter before it is allowed to stand.
              </p>
            </div>
          </div>
        </Reveal>

        {/* Discipline score — the number, then what makes it up. */}
        <Reveal y={48} delay={0.06} className="md:col-span-2">
          <Card>
            <div className="flex items-start justify-between gap-6">
              <div>
                <Tile icon={Gauge} />
                <h3 className="mt-6 text-lg font-medium tracking-[-0.03em]">Discipline score</h3>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  A single number out of 100, recomputed daily from four factors.
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className="font-mono-tabular text-5xl font-medium tracking-[-0.04em] text-foreground">
                  94
                </span>
                <span className="font-mono-tabular text-sm text-muted-foreground"> / 100</span>
              </div>
            </div>
            <ul className="mt-auto space-y-2.5 pt-8">
              {FACTORS.map((factor) => (
                <li key={factor.label} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 text-xs text-muted-foreground">
                    {factor.label}
                  </span>
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
                    <span
                      className="block h-full rounded-full bg-primary/70"
                      style={{ width: `${factor.pct}%` }}
                    />
                  </span>
                  <span className="font-mono-tabular w-8 shrink-0 text-right text-xs text-muted-foreground">
                    {factor.pct}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </Reveal>

        {/* Violation centre — what a logged breach actually looks like. */}
        <Reveal y={48} delay={0.12} className="md:col-span-2">
          <Card>
            <Tile icon={AlertTriangle} />
            <h3 className="mt-6 text-lg font-medium tracking-[-0.03em]">Violation centre</h3>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Every breach logged with a timestamp and the trade that caused it, tallied weekly
              and monthly.
            </p>
            <ul className="mt-auto pt-7">
              {BREACHES.map((breach) => (
                <li
                  key={breach.at}
                  className="flex items-baseline gap-3 border-t border-border py-3 text-sm"
                >
                  <span className="font-mono-tabular shrink-0 text-xs text-muted-foreground">
                    {breach.at}
                  </span>
                  <span className="shrink-0 font-medium text-destructive">{breach.kind}</span>
                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                    {breach.detail}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </Reveal>

        {/* Session control — the window, drawn. */}
        <Reveal y={48} delay={0.18}>
          <Card>
            <Tile icon={Clock} />
            <h3 className="mt-6 text-lg font-medium tracking-[-0.03em]">Session control</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              London, New York, Asian, the overlap — or a window you draw yourself. Outside it,
              the account stays flat.
            </p>
            <div className="mt-auto pt-8">
              <div className="relative h-9 overflow-hidden rounded-tile bg-secondary">
                {/* The permitted window, as the dashboard draws it. */}
                <span className="absolute inset-y-0 left-[28%] w-[42%] bg-primary/25" />
                <span className="absolute inset-y-0 left-[28%] w-px bg-primary" />
                <span className="absolute inset-y-0 left-[70%] w-px bg-primary" />
              </div>
              <div className="font-mono-tabular mt-2 flex justify-between text-[11px] text-muted-foreground">
                <span>00:00</span>
                <span className="text-primary">08:00 — 17:00</span>
                <span>24:00</span>
              </div>
            </div>
          </Card>
        </Reveal>
      </div>
    </Section>
  );
}

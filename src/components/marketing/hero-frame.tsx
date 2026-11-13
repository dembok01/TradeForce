import { FeedRowView, type FeedRowTone } from "@/components/dashboard/enforcement-feed";

/**
 * The hero's product frame. The reference centres its hero on a large static
 * dashboard screenshot; `public/` has none, and a screenshot goes stale the
 * moment the product moves, so this is composed instead.
 *
 * What it may reuse is bounded by the spec: `FeedRowView` is already
 * presentational and client-safe, so it is used directly and keeps its
 * hairlines — this depicts the product, and the product's feed has hairlines.
 * `EnforcementFeed` and `TodayStrip` are NOT used: the first needs
 * `useTimezone()`, the second takes dashboard-shaped props and renders its own
 * layout chrome, and bending either to fit a hero frame would push marketing
 * concerns into product components.
 *
 * Deliberately near-static. The one moving part is the live indicator; the
 * scripted feed belongs to the proof section further down the page, and running
 * two of them would halve the impact of both.
 */

const TILES = [
  { label: "Discipline score", value: "94", sub: "+3 this week" },
  { label: "Today's P/L", value: "−$128.90", sub: "limit −$400" },
  { label: "Trades today", value: "5 / 5", sub: "cap reached" },
];

const ROWS: Array<{ time: string; tone: FeedRowTone; title: string; amount?: string | null }> = [
  { time: "13:18", tone: "gain", title: "EURUSD LONG closed", amount: "+$86.40" },
  { time: "14:22", tone: "loss", title: "EURUSD LONG closed", amount: "−$67.30" },
  { time: "14:41", tone: "loss", title: "US30 SHORT closed", amount: "−$120.00" },
  {
    time: "14:43",
    tone: "violation",
    title: "Blocked — trade #6 today; your limit is 5.",
    amount: "Overtrading",
  },
];

export function HeroFrame() {
  return (
    <div className="bloom-gold">
      <div className="relative z-10 overflow-hidden rounded-panel border border-border bg-card shadow-2xl">
        {/* Chrome */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-success" />
            </span>
            <span className="text-xs text-muted-foreground">TradeForce EA — enforcing</span>
          </div>
          <span className="font-mono-tabular text-[11px] text-muted-foreground">charter v14</span>
        </div>

        <div className="grid gap-px bg-border/60 sm:grid-cols-3">
          {TILES.map((tile) => (
            <div key={tile.label} className="bg-card px-5 py-4">
              <p className="text-[11px] text-muted-foreground">{tile.label}</p>
              <p className="mt-1.5 font-mono-tabular text-xl font-medium tracking-[-0.03em]">
                {tile.value}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{tile.sub}</p>
            </div>
          ))}
        </div>

        <div className="px-5 pb-4 pt-1">
          <ul>
            {ROWS.map((row) => (
              <FeedRowView
                key={`${row.time}-${row.title}`}
                time={row.time}
                tone={row.tone}
                title={row.title}
                amount={row.amount}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

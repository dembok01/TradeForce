import { FeedRowView, type FeedRowTone } from "@/components/dashboard/enforcement-feed";

/**
 * The hero's product frame: a green day, a candle chart with the entries
 * marked, and the feed showing the one trade the charter closed.
 *
 * Composed rather than screenshotted, so it stays in the palette and never goes
 * stale. `FeedRowView` is the dashboard's own row. The figures agree with the
 * scripted demo further down the page: five trades for +$412.80, then #6.
 */

const TILES = [
  { label: "Today's P/L", value: "+$412.80", sub: "▲ 4.13% today", tone: "text-success" },
  { label: "Trades today", value: "5 / 5", sub: "cap reached", tone: "text-primary" },
  { label: "Discipline score", value: "94", sub: "▲ 3 this week", tone: "text-success" },
];

const ROWS: Array<{ time: string; tone: FeedRowTone; title: string; amount?: string | null }> = [
  { time: "13:37", tone: "gain", title: "EURUSD LONG closed", amount: "+$86.40" },
  { time: "14:05", tone: "gain", title: "GBPUSD LONG closed", amount: "+$114.75" },
  { time: "14:22", tone: "gain", title: "XAUUSD LONG closed", amount: "+$168.20" },
  { time: "14:41", tone: "gain", title: "US30 LONG closed", amount: "+$85.55" },
  { time: "14:43", tone: "violation", title: "Trade #6 closed · cap is 5", amount: "Overtrading" },
];

// XAUUSD M15: a climb through three pullbacks, as candle to candle moves.
// Moves are large against the drift so the bodies read as candles, not ticks.
// Opens are the previous close; wicks cycle through WICK, so the shape is fixed.
const OPEN = 2380;
const MOVES = [
  4.2, -2.6, 5.8, 3.1, -4.4, -2.2, 6.3, 4.7, -3.1, 5.2, 2.4, -5.6, -3.0, 6.8, 5.1, -2.7, 4.4,
  6.2, -3.9, 5.5, 3.3, -2.4, 6.1, 4.0,
];
const CLOSES = MOVES.reduce<number[]>((acc, m) => [...acc, (acc.at(-1) ?? OPEN) + m], []);
const WICK = [1.6, 2.4, 1.1, 2.0, 1.4, 2.8, 1.2, 2.1];
/** Candles where a long went in: the bottom of each pullback. */
const BUYS = [5, 12, 18];

const CANDLES = CLOSES.map((close, i) => {
  const open = i === 0 ? OPEN : CLOSES[i - 1];
  return {
    open,
    close,
    high: Math.max(open, close) + WICK[i % WICK.length],
    low: Math.min(open, close) - WICK[(i + 3) % WICK.length],
  };
});

const W = 640;
const H = 220;
const TOP = 10;
const BOTTOM = 34; // room under the lows for the signal dots
const HI = Math.max(...CANDLES.map((c) => c.high));
const LO = Math.min(...CANDLES.map((c) => c.low));
const STEP = W / CANDLES.length;
const LAST = CLOSES[CLOSES.length - 1];
const CHANGE = (((LAST - OPEN) / OPEN) * 100).toFixed(2);

const r = (n: number) => Math.round(n * 100) / 100;
const y = (price: number) => r(TOP + ((HI - price) / (HI - LO)) * (H - TOP - BOTTOM));
const x = (i: number) => r(STEP * i + STEP / 2);

function CandleChart() {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono-tabular text-xs text-muted-foreground">XAUUSD · M15</span>
        <span className="font-mono-tabular text-sm">
          {LAST.toFixed(1)} <span className="text-success">▲ {CHANGE}%</span>
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 block h-auto w-full" aria-hidden>
        {[0.25, 0.5, 0.75].map((f) => {
          const gy = r(TOP + f * (H - TOP - BOTTOM));
          return (
            <line key={f} x1={0} x2={W} y1={gy} y2={gy} className="stroke-border" strokeDasharray="2 6" />
          );
        })}

        <line x1={0} x2={W} y1={y(LAST)} y2={y(LAST)} className="stroke-success/50" strokeDasharray="4 4" />

        {CANDLES.map((c, i) => {
          const up = c.close >= c.open;
          return (
            <g key={i}>
              <line
                x1={x(i)}
                x2={x(i)}
                y1={y(c.high)}
                y2={y(c.low)}
                strokeWidth={1.5}
                className={up ? "stroke-success" : "stroke-destructive"}
              />
              <rect
                x={r(x(i) - STEP * 0.3)}
                width={r(STEP * 0.6)}
                y={y(Math.max(c.open, c.close))}
                height={Math.max(2, r(Math.abs(y(c.open) - y(c.close))))}
                rx={1.5}
                className={up ? "fill-success" : "fill-destructive"}
              />
            </g>
          );
        })}

        {BUYS.map((i) => {
          const cy = r(y(CANDLES[i].low) + 15);
          return (
            <g key={i}>
              <circle cx={x(i)} cy={cy} r={7} className="fill-success/15 stroke-success" strokeWidth={1.5} />
              <circle cx={x(i)} cy={cy} r={2.5} className="fill-success" />
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-success" />
          Buy signal
        </span>
      </div>
    </div>
  );
}

export function HeroFrame() {
  return (
    <div className="bloom-gold">
      <div className="relative z-10 overflow-hidden rounded-panel border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-success" />
            </span>
            <span className="text-xs text-muted-foreground">TradeForce EA · enforcing</span>
          </div>
          <span className="font-mono-tabular text-[11px] text-muted-foreground">charter v14</span>
        </div>

        <div className="grid grid-cols-3 gap-px bg-border/60">
          {TILES.map((tile) => (
            <div key={tile.label} className="bg-card px-3 py-4 sm:px-5">
              <p className="text-[11px] text-muted-foreground">{tile.label}</p>
              <p className={`mt-1.5 font-mono-tabular text-base font-medium tracking-[-0.03em] sm:text-xl ${tile.tone}`}>
                {tile.value}
              </p>
              <p className={`mt-0.5 font-mono-tabular text-[10px] sm:text-[11px] ${tile.tone}`}>{tile.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid border-t border-border/60 lg:grid-cols-[1.4fr_1fr]">
          <div className="border-b border-border/60 px-5 py-5 lg:border-b-0 lg:border-r">
            <CandleChart />
          </div>
          <div className="flex flex-col justify-center px-5 py-3">
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
    </div>
  );
}

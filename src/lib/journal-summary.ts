import type { Trade } from "@/lib/data/trades";

/**
 * What a journal adds up to. Pure, so the arithmetic an operator may hand to a
 * prop firm is checkable without a database.
 *
 * A trade counts as closed when it carries a pnl, not when exit_time is set:
 * the EA reports both together, but a manually logged trade can have an exit
 * price typed in and no result worked out, and a journal that counted those as
 * closed would report a win rate over a denominator it cannot support.
 *
 * Breakeven (pnl exactly 0) is neither a win nor a loss, and still counts in
 * the denominator - dropping it would quietly inflate the win rate.
 */
export type JournalSummary = {
  total: number;
  closed: number;
  open: number;
  wins: number;
  losses: number;
  breakeven: number;
  /** Of closed trades. 0 when nothing is closed, never NaN. */
  winRatePercent: number;
  grossProfit: number;
  /** A positive magnitude, so "gross loss 500" reads as a loss of 500. */
  grossLoss: number;
  netPnl: number;
  bestTrade: number | null;
  worstTrade: number | null;
  symbols: string[];
  firstEntry: string | null;
  lastEntry: string | null;
};

export function summariseTrades(trades: Trade[]): JournalSummary {
  let closed = 0, wins = 0, losses = 0, breakeven = 0;
  let grossProfit = 0, grossLoss = 0;
  let best: number | null = null;
  let worst: number | null = null;
  let firstEntry: string | null = null;
  let lastEntry: string | null = null;
  const symbols = new Set<string>();

  for (const t of trades) {
    if (t.symbol) symbols.add(t.symbol);
    if (t.entry_time) {
      if (!firstEntry || t.entry_time < firstEntry) firstEntry = t.entry_time;
      if (!lastEntry || t.entry_time > lastEntry) lastEntry = t.entry_time;
    }

    const pnl = t.pnl;
    if (pnl === null || pnl === undefined) continue;

    closed += 1;
    if (pnl > 0) {
      wins += 1;
      grossProfit += pnl;
    } else if (pnl < 0) {
      losses += 1;
      grossLoss += -pnl;
    } else {
      breakeven += 1;
    }
    if (best === null || pnl > best) best = pnl;
    if (worst === null || pnl < worst) worst = pnl;
  }

  return {
    total: trades.length,
    closed,
    open: trades.length - closed,
    wins,
    losses,
    breakeven,
    winRatePercent: closed === 0 ? 0 : (wins / closed) * 100,
    grossProfit,
    grossLoss,
    netPnl: grossProfit - grossLoss,
    bestTrade: best,
    worstTrade: worst,
    symbols: [...symbols].sort(),
    firstEntry,
    lastEntry,
  };
}

import type { Json, TradeDirection, TradeSource, ViolationType } from "@/lib/supabase/database.types";

// One merged event stream — trades and violations interleaved by time — is
// what makes the invisible EA feel tangible on the overview. Client-safe pure
// module; the queries live in src/lib/data/feed.ts.

export type FeedTradeEvent = {
  kind: "trade";
  id: string;
  at: string;
  symbol: string;
  direction: TradeDirection;
  pnl: number | null;
  source: TradeSource;
  closed: boolean;
};

export type FeedViolationEvent = {
  kind: "violation";
  id: string;
  at: string;
  type: ViolationType;
  details: Json;
};

export type FeedEvent = FeedTradeEvent | FeedViolationEvent;

export function mergeFeedEvents(events: FeedEvent[], limit: number): FeedEvent[] {
  return [...events]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

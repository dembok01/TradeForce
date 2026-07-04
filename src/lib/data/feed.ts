import "server-only";
import { getAccountContext } from "@/lib/data/context";
import { mergeFeedEvents, type FeedEvent } from "@/lib/enforcement-feed";

const DEFAULT_LIMIT = 10;

/**
 * The overview's live enforcement feed: recent trades and violations merged
 * into one stream. Two indexed queries (account + time desc), merged in JS —
 * no view needed at this volume.
 */
export async function getEnforcementFeed(limit = DEFAULT_LIMIT): Promise<FeedEvent[]> {
  const { supabase, account } = await getAccountContext();

  const [tradesRes, violationsRes] = await Promise.all([
    supabase
      .from("trades")
      .select("id, symbol, direction, pnl, entry_time, exit_time, source")
      .eq("account_id", account.id)
      .order("entry_time", { ascending: false })
      .limit(limit),
    supabase
      .from("violations")
      .select("id, type, details, occurred_at")
      .eq("account_id", account.id)
      .order("occurred_at", { ascending: false })
      .limit(limit),
  ]);
  if (tradesRes.error) throw new Error(tradesRes.error.message);
  if (violationsRes.error) throw new Error(violationsRes.error.message);

  const events: FeedEvent[] = [
    ...(tradesRes.data ?? []).map((t) => ({
      kind: "trade" as const,
      id: t.id,
      at: t.exit_time ?? t.entry_time,
      symbol: t.symbol,
      direction: t.direction,
      pnl: t.pnl,
      source: t.source,
      closed: t.exit_time !== null,
    })),
    ...(violationsRes.data ?? []).map((v) => ({
      kind: "violation" as const,
      id: v.id,
      at: v.occurred_at,
      type: v.type,
      details: v.details,
    })),
  ];

  return mergeFeedEvents(events, limit);
}

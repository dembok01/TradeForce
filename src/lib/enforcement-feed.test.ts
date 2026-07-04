import { describe, expect, it } from "vitest";
import { mergeFeedEvents, type FeedEvent } from "./enforcement-feed";

const trade = (id: string, at: string): FeedEvent => ({
  kind: "trade",
  id,
  at,
  symbol: "EURUSD",
  direction: "LONG",
  pnl: 10,
  source: "EA",
  closed: true,
});

const violation = (id: string, at: string): FeedEvent => ({
  kind: "violation",
  id,
  at,
  type: "OVERTRADING",
  details: {},
});

describe("mergeFeedEvents", () => {
  it("interleaves by timestamp, newest first", () => {
    const merged = mergeFeedEvents(
      [
        trade("t1", "2026-07-04T10:00:00Z"),
        violation("v1", "2026-07-04T10:30:00Z"),
        trade("t2", "2026-07-04T09:00:00Z"),
      ],
      10
    );
    expect(merged.map((e) => e.id)).toEqual(["v1", "t1", "t2"]);
  });

  it("respects the limit", () => {
    const events = Array.from({ length: 30 }, (_, i) =>
      trade(`t${i}`, `2026-07-04T${String(i % 24).padStart(2, "0")}:00:00Z`)
    );
    expect(mergeFeedEvents(events, 12)).toHaveLength(12);
  });

  it("is deterministic for identical timestamps", () => {
    const a = mergeFeedEvents([trade("b", "2026-07-04T10:00:00Z"), trade("a", "2026-07-04T10:00:00Z")], 5);
    expect(a.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

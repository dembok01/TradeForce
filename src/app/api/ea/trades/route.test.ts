import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createMockServiceClient, type MockBuilder } from "@/test/supabase-mock";

// Mock the auth + service + log seams; keep eaFailureResponse real so status
// codes reflect the actual failure mapping.
vi.mock("@/lib/ea-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ea-auth")>();
  return { ...actual, verifyEaRequest: vi.fn() };
});
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { POST } from "./route";
import { verifyEaRequest } from "@/lib/ea-auth";
import { createServiceClient } from "@/lib/supabase/service";

const AUTH_OK = { ok: true, userId: "u1", accountId: "a1", apiKeyId: "k1" } as const;

let builder: MockBuilder;

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/ea/trades", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
}

const validTrade = {
  symbol: "eurusd",
  direction: "LONG",
  entryPrice: 1.085,
  pnl: 42.5,
  entryTime: "2026-07-04T13:00:00Z",
  brokerDealId: "deal-123",
};

beforeEach(() => {
  const mock = createMockServiceClient();
  builder = mock.builder;
  (createServiceClient as Mock).mockReturnValue(mock.client);
  (verifyEaRequest as Mock).mockResolvedValue(AUTH_OK);
});

afterEach(() => vi.clearAllMocks());

describe("POST /api/ea/trades", () => {
  it("rejects an unauthenticated request with 401", async () => {
    (verifyEaRequest as Mock).mockResolvedValue({ ok: false, reason: "unauthorized" });
    const res = await post(validTrade);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    (verifyEaRequest as Mock).mockResolvedValue({ ok: false, reason: "rate_limited" });
    const res = await post(validTrade);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("rejects an out-of-bounds pnl with 400", async () => {
    const res = await post({ ...validTrade, pnl: 1e12 });
    expect(res.status).toBe(400);
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it("rejects a non-positive entry price with 400", async () => {
    const res = await post({ ...validTrade, entryPrice: 0 });
    expect(res.status).toBe(400);
  });

  it("inserts a new trade and returns 201", async () => {
    builder.maybeSingle.mockResolvedValueOnce({ data: null, error: null }); // dedup: none
    builder.single.mockResolvedValueOnce({ data: { id: "t-new" }, error: null }); // insert
    const res = await post(validTrade);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ tradeId: "t-new" });
    // Normalizes symbol and stamps the idempotency key + EA source.
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "EURUSD", source: "EA", broker_deal_id: "deal-123" })
    );
  });

  it("is idempotent: a duplicate brokerDealId returns the existing row without inserting", async () => {
    builder.maybeSingle.mockResolvedValueOnce({ data: { id: "t-existing" }, error: null });
    const res = await post(validTrade);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tradeId: "t-existing", duplicate: true });
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it("resolves a concurrent-insert 23505 race to the winning row", async () => {
    builder.maybeSingle.mockResolvedValueOnce({ data: null, error: null }); // first dedup: none
    builder.single.mockResolvedValueOnce({ data: null, error: { code: "23505" } }); // insert loses
    builder.maybeSingle.mockResolvedValueOnce({ data: { id: "t-winner" }, error: null }); // re-read
    const res = await post(validTrade);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tradeId: "t-winner", duplicate: true });
  });

  it("returns a generic 500 (no raw DB message) on insert failure", async () => {
    builder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    builder.single.mockResolvedValueOnce({
      data: null,
      error: { code: "XX000", message: "relation trades pnl overflow detail leak" },
    });
    const res = await post(validTrade);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to record trade.");
    expect(JSON.stringify(json)).not.toContain("overflow");
  });

  it("inserts without a dedup lookup when brokerDealId is absent", async () => {
    const { brokerDealId, ...noId } = validTrade;
    void brokerDealId;
    builder.single.mockResolvedValueOnce({ data: { id: "t-noid" }, error: null });
    const res = await post(noId);
    expect(res.status).toBe(201);
    expect(builder.maybeSingle).not.toHaveBeenCalled();
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ broker_deal_id: null })
    );
  });
});

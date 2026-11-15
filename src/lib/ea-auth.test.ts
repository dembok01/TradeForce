import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createHash } from "node:crypto";

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { verifyEaRequest, API_KEY_PREFIX } from "@/lib/ea-auth";
import { createServiceClient } from "@/lib/supabase/service";

const RAW_KEY = `${API_KEY_PREFIX}${"a".repeat(48)}`;
const KEY_HASH = createHash("sha256").update(RAW_KEY).digest("hex");

const FUTURE = "2099-01-01T00:00:00Z";
const PAST = "2020-01-01T00:00:00Z";

/**
 * Minimal builder. The auth path reads api_keys with
 * .select().eq().maybeSingle(), stamps it with .update().eq(), then reads
 * profiles the same way as the key read — so the mock has to answer per table
 * or the key row comes back as the plan row and every key reads as unpaid.
 */
function mockClient(
  lookup: { data: unknown; error: unknown },
  plan: { data: unknown; error: unknown } = {
    data: { plan: "paid", plan_expires_at: FUTURE },
    error: null,
  }
) {
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq: updateEq }));
  const keyMaybeSingle = vi.fn().mockResolvedValue(lookup);
  const planMaybeSingle = vi.fn().mockResolvedValue(plan);
  const from = vi.fn((table: string) => ({
    select: () => ({
      eq: () => ({ maybeSingle: table === "profiles" ? planMaybeSingle : keyMaybeSingle }),
    }),
    update,
  }));
  (createServiceClient as Mock).mockReturnValue({ from });
  return { update, updateEq, planMaybeSingle };
}

const LIVE_KEY = {
  id: "k1",
  user_id: "u1",
  account_id: "a1",
  revoked_at: null,
  last_used_at: null,
} as const;

function req() {
  return new Request("http://localhost/api/ea/ping", {
    headers: { authorization: `Bearer ${RAW_KEY}` },
  });
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.clearAllMocks());

describe("verifyEaRequest", () => {
  it("rejects a missing/short key without a DB call", async () => {
    const res = await verifyEaRequest(new Request("http://localhost", { headers: {} }));
    expect(res).toEqual({ ok: false, reason: "unauthorized" });
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("returns server_error (not unauthorized) on a DB lookup failure", async () => {
    mockClient({ data: null, error: { message: "connection reset" } });
    const res = await verifyEaRequest(req());
    expect(res).toEqual({ ok: false, reason: "server_error" });
  });

  it("rejects a revoked key", async () => {
    mockClient({
      data: { id: "k1", user_id: "u1", account_id: "a1", revoked_at: "2026-01-01", last_used_at: null },
      error: null,
    });
    const res = await verifyEaRequest(req());
    expect(res).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("stamps last_used_at when it is null", async () => {
    const { update } = mockClient({
      data: { id: "k1", user_id: "u1", account_id: "a1", revoked_at: null, last_used_at: null },
      error: null,
    });
    const res = await verifyEaRequest(req());
    expect(res.ok).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("stamps last_used_at when it is stale (> 60s old)", async () => {
    const stale = new Date(Date.now() - 120_000).toISOString();
    const { update } = mockClient({
      data: { id: "k1", user_id: "u1", account_id: "a1", revoked_at: null, last_used_at: stale },
      error: null,
    });
    await verifyEaRequest(req());
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("skips the stamp when last_used_at is fresh (< 60s) — kills write amplification", async () => {
    const fresh = new Date(Date.now() - 5_000).toISOString();
    const { update } = mockClient({
      data: { id: "k1", user_id: "u1", account_id: "a1", revoked_at: null, last_used_at: fresh },
      error: null,
    });
    const res = await verifyEaRequest(req());
    expect(res).toEqual({
      ok: true,
      userId: "u1",
      accountId: "a1",
      apiKeyId: "k1",
      entitled: true,
    });
    expect(update).not.toHaveBeenCalled();
  });

  /**
   * The paywall. `entitled` is resolved here so that the seven EA routes
   * cannot each have their own opinion about who has paid.
   */
  describe("entitlement", () => {
    it("is entitled on a paid plan that is still running", async () => {
      mockClient({ data: LIVE_KEY, error: null });
      const res = await verifyEaRequest(req());
      expect(res).toMatchObject({ ok: true, entitled: true });
    });

    it("is not entitled once the paid period has passed", async () => {
      mockClient(
        { data: LIVE_KEY, error: null },
        { data: { plan: "paid", plan_expires_at: PAST }, error: null }
      );
      const res = await verifyEaRequest(req());
      expect(res).toMatchObject({ ok: true, entitled: false });
    });

    it("is not entitled on a free account", async () => {
      mockClient(
        { data: LIVE_KEY, error: null },
        { data: { plan: null, plan_expires_at: null }, error: null }
      );
      const res = await verifyEaRequest(req());
      expect(res).toMatchObject({ ok: true, entitled: false });
    });

    it("is not entitled when there is no profile row at all", async () => {
      mockClient({ data: LIVE_KEY, error: null }, { data: null, error: null });
      const res = await verifyEaRequest(req());
      expect(res).toMatchObject({ ok: true, entitled: false });
    });

    // The important one. Reading "unpaid" off a DB blip would silently switch
    // enforcement off for a paying trader; a 5xx makes the EA retry on its
    // next tick and keep the charter it already holds.
    it("fails as server_error, not as unpaid, when the plan read fails", async () => {
      mockClient(
        { data: LIVE_KEY, error: null },
        { data: null, error: { message: "connection reset" } }
      );
      const res = await verifyEaRequest(req());
      expect(res).toEqual({ ok: false, reason: "server_error" });
    });
  });
});

it("KEY_HASH sanity — hash is deterministic", () => {
  expect(createHash("sha256").update(RAW_KEY).digest("hex")).toBe(KEY_HASH);
});

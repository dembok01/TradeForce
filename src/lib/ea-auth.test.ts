import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createHash } from "node:crypto";

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/log", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { verifyEaRequest, API_KEY_PREFIX } from "@/lib/ea-auth";
import { createServiceClient } from "@/lib/supabase/service";

const RAW_KEY = `${API_KEY_PREFIX}${"a".repeat(48)}`;
const KEY_HASH = createHash("sha256").update(RAW_KEY).digest("hex");

// Minimal builder: the auth path does .select().eq().maybeSingle() to look up,
// then .update().eq() to stamp.
function mockClient(lookup: { data: unknown; error: unknown }) {
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq: updateEq }));
  const maybeSingle = vi.fn().mockResolvedValue(lookup);
  const from = vi.fn(() => ({
    select: () => ({ eq: () => ({ maybeSingle }) }),
    update,
  }));
  (createServiceClient as Mock).mockReturnValue({ from });
  return { update, updateEq };
}

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
    expect(res).toEqual({ ok: true, userId: "u1", accountId: "a1", apiKeyId: "k1" });
    expect(update).not.toHaveBeenCalled();
  });
});

it("KEY_HASH sanity — hash is deterministic", () => {
  expect(createHash("sha256").update(RAW_KEY).digest("hex")).toBe(KEY_HASH);
});

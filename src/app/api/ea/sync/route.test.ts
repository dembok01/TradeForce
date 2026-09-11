import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createMockServiceClient, type MockBuilder } from "@/test/supabase-mock";

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

const RULES = {
  id: "r1", user_id: "u1", account_id: "a1",
  config_version: 7, is_active: true,
  daily_loss_limit: 500, max_trades_per_day: 3, max_open_positions: 2,
  risk_per_trade_percent: 1,
  session_london_enabled: true, session_new_york_enabled: false,
  session_asian_enabled: false, session_london_ny_overlap_enabled: false,
  custom_session_start: null, custom_session_end: null,
  timezone: "Asia/Kolkata",
  created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
};

let builder: MockBuilder;
let from: Mock;

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/ea/sync", { method: "POST", body: JSON.stringify(body) })
  );
}

beforeEach(() => {
  const mock = createMockServiceClient();
  builder = mock.builder;
  from = mock.from;
  (createServiceClient as Mock).mockReturnValue(mock.client);
  (verifyEaRequest as Mock).mockResolvedValue(AUTH_OK);
  builder.maybeSingle.mockResolvedValue({ data: RULES, error: null });
});

afterEach(() => vi.clearAllMocks());

describe("POST /api/ea/sync", () => {
  it("sends the full config when the EA's version is stale", async () => {
    const res = await post({ equity: 10_000, knownConfigVersion: 6 });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.configVersion).toBe(7);
    expect(json.config).toMatchObject({
      isActive: true,
      dailyLossLimit: 500,
      sessions: expect.objectContaining({ london: true, timezone: "Asia/Kolkata" }),
    });
  });

  it("omits the config when the EA is already current", async () => {
    // The entire point of the merge: the steady state must stay small, or we
    // have traded three cheap calls for one expensive one.
    const res = await post({ equity: 10_000, knownConfigVersion: 7 });
    const json = await res.json();
    expect(json).toEqual({ ok: true, configured: true, configVersion: 7, serverTime: expect.any(String) });
    expect(json.config).toBeUndefined();
  });

  it("sends the full config when the EA reports no version at all", async () => {
    // A freshly started EA, or one still on a build that omits the field.
    const res = await post({ equity: 10_000 });
    expect((await res.json()).config).toBeDefined();
  });

  it("records the equity snapshot on every sync, config or not", async () => {
    // account_snapshots doubles as the EA uptime history the ops console reads
    // as outages, so a sync that skips the write would fake downtime.
    await post({ equity: 12_345.67, balance: 12_000, knownConfigVersion: 7 });
    expect(from).toHaveBeenCalledWith("account_snapshots");
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: "a1", user_id: "u1", equity: 12_345.67 })
    );
  });

  it("reports unconfigured when the account has no rules yet", async () => {
    builder.maybeSingle.mockResolvedValue({ data: null, error: null });
    const json = await (await post({ equity: 10_000 })).json();
    expect(json).toMatchObject({ ok: true, configured: false, configVersion: null });
  });

  it("forwards EA telemetry to mt5_instances", async () => {
    await post({ equity: 10_000, knownConfigVersion: 7, failedFetches: 12, eaVersion: "1.24" });
    expect(from).toHaveBeenCalledWith("mt5_instances");
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ ea_failed_fetches: 12, ea_version: "1.24" })
    );
  });

  it("rejects a payload with no equity", async () => {
    expect((await post({ knownConfigVersion: 7 })).status).toBe(400);
  });

  it("returns a generic 500 without leaking DB detail", async () => {
    builder.maybeSingle.mockResolvedValue({
      data: null, error: { code: "XX000", message: "constraint trading_rules_secret_detail" },
    });
    const res = await post({ equity: 10_000 });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
});

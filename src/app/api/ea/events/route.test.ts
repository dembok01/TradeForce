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
let builder: MockBuilder;

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/ea/events", { method: "POST", body: JSON.stringify(body) })
  );
}

beforeEach(() => {
  const mock = createMockServiceClient();
  builder = mock.builder;
  (createServiceClient as Mock).mockReturnValue(mock.client);
  (verifyEaRequest as Mock).mockResolvedValue(AUTH_OK);
});

afterEach(() => vi.clearAllMocks());

describe("POST /api/ea/events", () => {
  it("rejects an unknown event type with 400", async () => {
    const res = await post({ type: "EA_EXPLODED" });
    expect(res.status).toBe(400);
  });

  it("records an EA_REMOVED event and returns 201", async () => {
    builder.single.mockResolvedValueOnce({ data: { id: "e-new" }, error: null });
    const res = await post({ type: "EA_REMOVED", occurredAt: "2026-07-13T09:30:00Z" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ eventId: "e-new" });
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "EA_REMOVED", account_id: "a1" })
    );
  });

  it("returns a generic 500 without leaking DB detail", async () => {
    builder.single.mockResolvedValueOnce({
      data: null,
      error: { code: "XX000", message: "constraint ea_events_secret_detail" },
    });
    const res = await post({ type: "EA_REMOVED" });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to record event.");
    expect(JSON.stringify(json)).not.toContain("secret");
  });
});

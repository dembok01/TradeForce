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
    new Request("http://localhost/api/ea/violations", { method: "POST", body: JSON.stringify(body) })
  );
}

const validViolation = {
  type: "OVERTRADING",
  details: { tradesToday: 6, cap: 5 },
  eventId: "OVERTRADING-777",
};

beforeEach(() => {
  const mock = createMockServiceClient();
  builder = mock.builder;
  (createServiceClient as Mock).mockReturnValue(mock.client);
  (verifyEaRequest as Mock).mockResolvedValue(AUTH_OK);
});

afterEach(() => vi.clearAllMocks());

describe("POST /api/ea/violations", () => {
  it("rejects an unknown violation type with 400", async () => {
    const res = await post({ ...validViolation, type: "NOT_A_TYPE" });
    expect(res.status).toBe(400);
  });

  it("inserts a new violation and returns 201", async () => {
    builder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    builder.single.mockResolvedValueOnce({ data: { id: "v-new" }, error: null });
    const res = await post(validViolation);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ violationId: "v-new" });
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ type: "OVERTRADING", event_id: "OVERTRADING-777" })
    );
  });

  it("is idempotent on a duplicate eventId", async () => {
    builder.maybeSingle.mockResolvedValueOnce({ data: { id: "v-existing" }, error: null });
    const res = await post(validViolation);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ violationId: "v-existing", duplicate: true });
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it("rejects an oversized details payload", async () => {
    const huge = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`k${i}`, "x".repeat(20)]));
    const res = await post({ type: "OVERTRADING", details: huge });
    expect(res.status).toBe(400);
  });

  it("returns a generic 500 without leaking DB detail", async () => {
    builder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    builder.single.mockResolvedValueOnce({
      data: null,
      error: { code: "XX000", message: "constraint violations_secret_detail" },
    });
    const res = await post(validViolation);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to record violation.");
    expect(JSON.stringify(json)).not.toContain("secret");
  });
});

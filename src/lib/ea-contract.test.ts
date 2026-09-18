import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { eaEventSchema, eaReportSchema, eaSyncSchema, eaViolationReportSchema } from "@/lib/ea-payload";
import { eaTradeReportSchema } from "@/lib/schemas/trade";

// The same cases run against the pool agent's Python validators
// (infra/pool-agent/test_tf_bridge.py). If this file and that one disagree, a
// hosted EA and a desktop EA are being held to different rules.
type Case = {
  name: string;
  kind: "sync" | "account" | "trades" | "violations" | "events";
  valid: boolean;
  body: unknown;
  expect?: Record<string, unknown>;
};

const { cases } = JSON.parse(
  readFileSync(new URL("../../infra/pool-agent/contract/ea-payloads.json", import.meta.url), "utf8"),
) as { cases: Case[] };

const SCHEMAS: Record<Case["kind"], ZodType> = {
  sync: eaSyncSchema,
  account: eaReportSchema,
  trades: eaTradeReportSchema,
  violations: eaViolationReportSchema,
  events: eaEventSchema,
};

describe("EA payload contract (website side)", () => {
  it("has cases for every kind", () => {
    expect(new Set(cases.map((c) => c.kind))).toEqual(new Set(Object.keys(SCHEMAS)));
  });

  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const parsed = SCHEMAS[c.kind].safeParse(c.body);
    expect(parsed.success).toBe(c.valid);
    if (parsed.success && c.expect) expect(parsed.data).toMatchObject(c.expect);
  });
});

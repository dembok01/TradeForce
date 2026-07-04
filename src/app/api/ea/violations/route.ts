import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyEaRequest, eaFailureResponse } from "@/lib/ea-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { log } from "@/lib/log";
import type { Json, ViolationType } from "@/lib/supabase/database.types";

const VIOLATION_TYPES = [
  "OVERTRADING",
  "OUTSIDE_SESSION",
  "DAILY_LOSS_BREACH",
  "OPEN_POSITIONS_BREACH",
  "RISK_PER_TRADE_BREACH",
] as const satisfies readonly ViolationType[];

const violationReportSchema = z.object({
  type: z.enum(VIOLATION_TYPES),
  details: z
    .record(z.string(), z.unknown())
    .refine((d) => JSON.stringify(d).length <= 2_000, "details too large")
    .optional(),
  occurredAt: z
    .string()
    .refine((v) => Number.isFinite(Date.parse(v)), "Invalid occurredAt.")
    .optional(),
  tradeId: z.uuid().nullable().optional(),
  // Deterministic id the EA derives from the triggering event (e.g.
  // type + deal ticket, or type + local day for daily-loss). When present,
  // (account, eventId) is the idempotency key for retried reports.
  eventId: z.string().trim().min(1).max(64).optional(),
});

// The return path of the enforcement loop: when the EA blocks (or detects) a
// rule breach it reports it here, which is what feeds the Violation Centre,
// the "violations prevented" tile, and the discipline score.
export async function POST(request: Request) {
  const auth = await verifyEaRequest(request);
  if (!auth.ok) return eaFailureResponse(auth);

  const body = await request.json().catch(() => null);
  const parsed = violationReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload.", issues: parsed.error.issues }, { status: 400 });
  }

  const supabase = createServiceClient();
  const eventId = parsed.data.eventId ?? null;

  const findExisting = async () => {
    if (!eventId) return null;
    const { data, error } = await supabase
      .from("violations")
      .select("id")
      .eq("account_id", auth.accountId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (error) {
      log.error("ea violations dedup lookup failed", { detail: error.message, accountId: auth.accountId });
      return null;
    }
    return data;
  };

  const existing = await findExisting();
  if (existing) {
    return NextResponse.json({ violationId: existing.id, duplicate: true });
  }

  const { data, error } = await supabase
    .from("violations")
    .insert({
      user_id: auth.userId,
      account_id: auth.accountId,
      type: parsed.data.type,
      details: (parsed.data.details ?? {}) as Json,
      event_id: eventId,
      ...(parsed.data.occurredAt ? { occurred_at: parsed.data.occurredAt } : {}),
      ...(parsed.data.tradeId ? { trade_id: parsed.data.tradeId } : {}),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const winner = await findExisting();
      if (winner) return NextResponse.json({ violationId: winner.id, duplicate: true });
    }
    log.error("ea violation insert failed", { detail: error.message, accountId: auth.accountId });
    return NextResponse.json({ error: "Failed to record violation." }, { status: 500 });
  }

  return NextResponse.json({ violationId: data.id }, { status: 201 });
}

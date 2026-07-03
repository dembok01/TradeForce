import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyEaRequest, eaFailureResponse } from "@/lib/ea-auth";
import { createServiceClient } from "@/lib/supabase/service";
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
  details: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z
    .string()
    .refine((v) => Number.isFinite(Date.parse(v)), "Invalid occurredAt.")
    .optional(),
  tradeId: z.uuid().nullable().optional(),
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
  const { data, error } = await supabase
    .from("violations")
    .insert({
      user_id: auth.userId,
      account_id: auth.accountId,
      type: parsed.data.type,
      details: (parsed.data.details ?? {}) as Json,
      ...(parsed.data.occurredAt ? { occurred_at: parsed.data.occurredAt } : {}),
      ...(parsed.data.tradeId ? { trade_id: parsed.data.tradeId } : {}),
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ violationId: data.id }, { status: 201 });
}

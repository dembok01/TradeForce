import { NextResponse } from "next/server";
import { verifyEaRequest, eaFailureResponse } from "@/lib/ea-auth";
import { eaEventSchema } from "@/lib/ea-payload";
import { createServiceClient } from "@/lib/supabase/service";
import { log } from "@/lib/log";
import type { Json } from "@/lib/supabase/database.types";

// Lifecycle telemetry, not violations: an EA removed from the chart can't
// enforce anything, so the dashboard must say so - but the event carries no
// discipline-score penalty. Fired best-effort from the EA's OnDeinit, so a
// missing event is expected when the terminal died before the POST landed.
export async function POST(request: Request) {
  const auth = await verifyEaRequest(request);
  if (!auth.ok) return eaFailureResponse(auth);

  const body = await request.json().catch(() => null);
  const parsed = eaEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload.", issues: parsed.error.issues }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("ea_events")
    .insert({
      user_id: auth.userId,
      account_id: auth.accountId,
      event_type: parsed.data.type,
      details: (parsed.data.details ?? {}) as Json,
      ...(parsed.data.occurredAt ? { occurred_at: parsed.data.occurredAt } : {}),
    })
    .select("id")
    .single();

  if (error) {
    log.error("ea event insert failed", { detail: error.message, accountId: auth.accountId });
    return NextResponse.json({ error: "Failed to record event." }, { status: 500 });
  }

  return NextResponse.json({ eventId: data.id }, { status: 201 });
}

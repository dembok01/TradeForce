import { NextResponse } from "next/server";
import { verifyEaRequest, eaFailureResponse } from "@/lib/ea-auth";
import { eaTradeReportSchema } from "@/lib/schemas/trade";
import { createServiceClient } from "@/lib/supabase/service";
import { log } from "@/lib/log";

// The EA POSTs each closed (or opened) trade here as it happens. Reports that
// carry a brokerDealId are idempotent on (account, brokerDealId): the EA's
// retry queue may re-POST a report whose first attempt committed but whose
// response was lost — that must not double-count P/L or trade caps.
export async function POST(request: Request) {
  const auth = await verifyEaRequest(request);
  if (!auth.ok) return eaFailureResponse(auth);

  const body = await request.json().catch(() => null);
  const parsed = eaTradeReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload.", issues: parsed.error.issues }, { status: 400 });
  }

  const supabase = createServiceClient();
  const brokerDealId = parsed.data.brokerDealId ?? null;

  const findExisting = async () => {
    if (!brokerDealId) return null;
    const { data, error } = await supabase
      .from("trades")
      .select("id")
      .eq("account_id", auth.accountId)
      .eq("broker_deal_id", brokerDealId)
      .maybeSingle();
    if (error) {
      log.error("ea trades dedup lookup failed", { detail: error.message, accountId: auth.accountId });
      return null;
    }
    return data;
  };

  const existing = await findExisting();
  if (existing) {
    return NextResponse.json({ tradeId: existing.id, duplicate: true });
  }

  const { data, error } = await supabase
    .from("trades")
    .insert({
      user_id: auth.userId,
      account_id: auth.accountId,
      symbol: parsed.data.symbol,
      direction: parsed.data.direction,
      entry_price: parsed.data.entryPrice,
      exit_price: parsed.data.exitPrice ?? null,
      quantity: parsed.data.quantity ?? null,
      pnl: parsed.data.pnl ?? null,
      entry_time: parsed.data.entryTime,
      exit_time: parsed.data.exitTime ?? null,
      source: "EA",
      broker_deal_id: brokerDealId,
    })
    .select("id")
    .single();

  if (error) {
    // Lost the race against a concurrent retry of the same deal — the partial
    // unique index rejected us; the winner's row is the answer.
    if (error.code === "23505") {
      const winner = await findExisting();
      if (winner) return NextResponse.json({ tradeId: winner.id, duplicate: true });
    }
    log.error("ea trade insert failed", { detail: error.message, accountId: auth.accountId });
    return NextResponse.json({ error: "Failed to record trade." }, { status: 500 });
  }

  return NextResponse.json({ tradeId: data.id }, { status: 201 });
}

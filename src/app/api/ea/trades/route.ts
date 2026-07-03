import { NextResponse } from "next/server";
import { verifyEaRequest, eaFailureResponse } from "@/lib/ea-auth";
import { eaTradeReportSchema } from "@/lib/schemas/trade";
import { createServiceClient } from "@/lib/supabase/service";

// The EA POSTs each closed (or opened) trade here as it happens.
export async function POST(request: Request) {
  const auth = await verifyEaRequest(request);
  if (!auth.ok) return eaFailureResponse(auth);

  const body = await request.json().catch(() => null);
  const parsed = eaTradeReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload.", issues: parsed.error.issues }, { status: 400 });
  }

  const supabase = createServiceClient();
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
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tradeId: data.id }, { status: 201 });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyEaRequest } from "@/lib/ea-auth";
import { createServiceClient } from "@/lib/supabase/service";

const tradeReportSchema = z.object({
  symbol: z.string().min(1),
  direction: z.enum(["LONG", "SHORT"]),
  entryPrice: z.number(),
  exitPrice: z.number().nullable().optional(),
  quantity: z.number().nullable().optional(),
  pnl: z.number().nullable().optional(),
  entryTime: z.string(),
  exitTime: z.string().nullable().optional(),
});

// Phase 2 target: the EA POSTs each closed (or opened) trade here as it happens.
// Phase 1 ships the shape and persistence; nothing posts to it yet.
export async function POST(request: Request) {
  const auth = await verifyEaRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = tradeReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload.", issues: parsed.error.issues }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("trades")
    .insert({
      user_id: auth.userId,
      account_id: auth.accountId,
      symbol: parsed.data.symbol.toUpperCase(),
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

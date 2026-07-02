import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyEaRequest } from "@/lib/ea-auth";
import { createServiceClient } from "@/lib/supabase/service";

const accountUpdateSchema = z.object({
  equity: z.number(),
  balance: z.number().nullable().optional(),
});

// Phase 2 target: the EA POSTs current equity/balance here periodically so the
// dashboard's "Current equity" tile reflects the live account. Phase 1 ships
// the shape and persistence; nothing posts to it yet.
export async function POST(request: Request) {
  const auth = await verifyEaRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = accountUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload.", issues: parsed.error.issues }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("accounts")
    .update({
      current_equity: parsed.data.equity,
      ...(parsed.data.balance !== undefined && parsed.data.balance !== null
        ? { starting_balance: parsed.data.balance }
        : {}),
    })
    .eq("id", auth.accountId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyEaRequest, eaFailureResponse } from "@/lib/ea-auth";
import { createServiceClient } from "@/lib/supabase/service";

const accountUpdateSchema = z.object({
  equity: z.number().finite(),
  balance: z.number().finite().nullable().optional(),
});

// The EA POSTs current equity/balance here periodically. Two writes per report:
// the in-place accounts row the dashboard tiles read, and an append-only
// account_snapshots row — equity *history* can't be backfilled later, so it's
// recorded from the first report onward (future equity-curve source).
export async function POST(request: Request) {
  const auth = await verifyEaRequest(request);
  if (!auth.ok) return eaFailureResponse(auth);

  const body = await request.json().catch(() => null);
  const parsed = accountUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload.", issues: parsed.error.issues }, { status: 400 });
  }

  const supabase = createServiceClient();
  const [updateRes, snapshotRes] = await Promise.all([
    supabase
      .from("accounts")
      .update({
        current_equity: parsed.data.equity,
        ...(parsed.data.balance !== undefined && parsed.data.balance !== null
          ? { starting_balance: parsed.data.balance }
          : {}),
      })
      .eq("id", auth.accountId),
    supabase.from("account_snapshots").insert({
      user_id: auth.userId,
      account_id: auth.accountId,
      equity: parsed.data.equity,
      balance: parsed.data.balance ?? null,
    }),
  ]);

  const error = updateRes.error ?? snapshotRes.error;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

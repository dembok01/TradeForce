import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyEaRequest, eaFailureResponse } from "@/lib/ea-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { EA_REPORT_BOUNDS } from "@/lib/schemas/trade";
import { log } from "@/lib/log";

const accountUpdateSchema = z.object({
  equity: z.number().finite().min(-EA_REPORT_BOUNDS.pnlAbsMax).max(EA_REPORT_BOUNDS.pnlAbsMax),
  balance: z
    .number()
    .finite()
    .min(-EA_REPORT_BOUNDS.pnlAbsMax)
    .max(EA_REPORT_BOUNDS.pnlAbsMax)
    .nullable()
    .optional(),

  // Ops telemetry (v1.23+). All optional so older EAs keep working unchanged.
  // failedFetches is the important one: requests that never arrived cannot be
  // observed server-side, so the EA counts them and ships the total here.
  failedFetches: z.number().int().min(0).max(1_000_000).optional(),
  lastHttpStatus: z.number().int().min(0).max(599).optional(),
  queuedPosts: z.number().int().min(0).max(1000).optional(),
  fromCache: z.boolean().optional(),
  backoffSeconds: z.number().int().min(0).max(86_400).optional(),
  eaVersion: z.string().max(16).optional(),
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

  const d = parsed.data;
  const supabase = createServiceClient();

  // Only touch mt5_instances when the EA actually sent telemetry, so a desktop
  // EA (no hosted instance) doesn't create noise, and older builds are no-ops.
  const telemetry =
    d.failedFetches !== undefined || d.eaVersion !== undefined
      ? supabase
          .from("mt5_instances")
          .update({
            ea_version: d.eaVersion ?? null,
            ea_failed_fetches: d.failedFetches ?? null,
            ea_last_http_status: d.lastHttpStatus ?? null,
            ea_queued_posts: d.queuedPosts ?? null,
            ea_from_cache: d.fromCache ?? null,
            ea_backoff_seconds: d.backoffSeconds ?? null,
            ea_reported_at: new Date().toISOString(),
          })
          .eq("account_id", auth.accountId)
      : Promise.resolve({ error: null });

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

  // Telemetry is best-effort: never fail an equity report because the ops
  // columns didn't write.
  await telemetry;

  const error = updateRes.error ?? snapshotRes.error;
  if (error) {
    log.error("ea account report failed", { detail: error.message, accountId: auth.accountId });
    return NextResponse.json({ error: "Failed to record account state." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

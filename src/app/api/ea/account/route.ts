import { NextResponse } from "next/server";
import { verifyEaRequest, eaFailureResponse } from "@/lib/ea-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { eaReportSchema, recordAccountReport } from "@/lib/ea-payload";
import { log } from "@/lib/log";

// Superseded by POST /api/ea/sync, which carries this report and the config
// check in one call. Kept for EAs already installed on traders' own PCs, and
// still used by the merged EA as its retry-queue target: a replayed report
// should not drag a config payload back with it.
export async function POST(request: Request) {
  const auth = await verifyEaRequest(request);
  if (!auth.ok) return eaFailureResponse(auth);

  const body = await request.json().catch(() => null);
  const parsed = eaReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload.", issues: parsed.error.issues }, { status: 400 });
  }

  const { error } = await recordAccountReport(createServiceClient(), auth, parsed.data);
  if (error) {
    log.error("ea account report failed", { detail: error, accountId: auth.accountId });
    return NextResponse.json({ error: "Failed to record account state." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

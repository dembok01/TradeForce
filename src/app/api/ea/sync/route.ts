import { NextResponse } from "next/server";
import { verifyEaRequest, eaFailureResponse } from "@/lib/ea-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { eaSyncSchema, shapeConfig, recordAccountReport } from "@/lib/ea-payload";
import { log } from "@/lib/log";

/**
 * The whole EA polling loop in one request.
 *
 * It replaces GET /api/ea/ping (every 15s), GET /api/ea/config (60s) and
 * POST /api/ea/account (60s) — 360 requests/hour/user, which is 259k a month
 * each and 52M at 200 users. Those three did the work of one: ping and config
 * read the *same* trading_rules row, and the account POST was already on the
 * wire every 60s, so the equity report can carry the version check for free.
 *
 * One POST every 60s => 60 requests/hour/user, a 6x cut, with no loss of
 * enforcement speed: the daily-loss check runs locally on every tick. The only
 * thing that slows is how fast a *rule change* made in the dashboard reaches
 * the terminal, from ~15s to ~60s.
 *
 * The full config comes back only when the EA's version is stale, so the steady
 * state is a small response.
 */
export async function POST(request: Request) {
  const auth = await verifyEaRequest(request);
  if (!auth.ok) return eaFailureResponse(auth);

  const body = await request.json().catch(() => null);
  const parsed = eaSyncSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload.", issues: parsed.error.issues }, { status: 400 });
  }

  const d = parsed.data;
  const supabase = createServiceClient();

  // The read and the writes don't depend on each other, so they overlap.
  const [rulesRes, report] = await Promise.all([
    supabase.from("trading_rules").select("*").eq("account_id", auth.accountId).maybeSingle(),
    recordAccountReport(supabase, auth, d),
  ]);

  if (rulesRes.error) {
    log.error("ea sync config read failed", { detail: rulesRes.error.message, accountId: auth.accountId });
    return NextResponse.json({ error: "Failed to load config." }, { status: 500 });
  }
  if (report.error) {
    log.error("ea sync report failed", { detail: report.error, accountId: auth.accountId });
    return NextResponse.json({ error: "Failed to record account state." }, { status: 500 });
  }

  const rules = rulesRes.data;
  const serverTime = new Date().toISOString();

  if (!rules) {
    return NextResponse.json({ ok: true, configured: false, configVersion: null, serverTime });
  }

  // Absent knownConfigVersion means an old or freshly started EA: send it all.
  const known = d.knownConfigVersion ?? -1;
  const stale = known !== rules.config_version;

  return NextResponse.json({
    ok: true,
    configured: true,
    configVersion: rules.config_version,
    serverTime,
    ...(stale ? { config: shapeConfig(rules) } : {}),
  });
}

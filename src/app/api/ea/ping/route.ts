import { NextResponse } from "next/server";
import { verifyEaRequest, eaFailureResponse } from "@/lib/ea-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { log } from "@/lib/log";

// The force-sync half of the polling loop: one indexed read returning just the
// config version, cheap enough for the EA to hit every few seconds. When the
// version changes (a dashboard save bumps it via DB trigger), the EA re-fetches
// the full /api/ea/config — so a LOCKED state reaches the terminal in seconds,
// not at the next 60s full poll.
export async function GET(request: Request) {
  const auth = await verifyEaRequest(request);
  if (!auth.ok) return eaFailureResponse(auth);

  const supabase = createServiceClient();
  const { data: rules, error } = await supabase
    .from("trading_rules")
    .select("config_version")
    .eq("account_id", auth.accountId)
    .maybeSingle();
  if (error) {
    log.error("ea ping read failed", { detail: error.message, accountId: auth.accountId });
    return NextResponse.json({ error: "Failed to check config version." }, { status: 500 });
  }

  return NextResponse.json({
    configured: Boolean(rules),
    configVersion: rules?.config_version ?? null,
    serverTime: new Date().toISOString(),
  });
}

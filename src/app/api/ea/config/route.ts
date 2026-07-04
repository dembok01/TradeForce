import { NextResponse } from "next/server";
import { verifyEaRequest, eaFailureResponse } from "@/lib/ea-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { log } from "@/lib/log";

// The EA polls this every ~60s to pick up rule changes made in the dashboard
// without restarting. configVersion is bumped by a DB trigger on every rules
// update; the cheap high-frequency check lives at /api/ea/ping.
export async function GET(request: Request) {
  const auth = await verifyEaRequest(request);
  if (!auth.ok) return eaFailureResponse(auth);

  const supabase = createServiceClient();
  const { data: rules, error } = await supabase
    .from("trading_rules")
    .select("*")
    .eq("account_id", auth.accountId)
    .maybeSingle();
  if (error) {
    log.error("ea config read failed", { detail: error.message, accountId: auth.accountId });
    return NextResponse.json({ error: "Failed to load config." }, { status: 500 });
  }

  if (!rules) {
    return NextResponse.json({ configured: false });
  }

  return NextResponse.json({
    configured: true,
    configVersion: rules.config_version,
    isActive: rules.is_active,
    dailyLossLimit: rules.daily_loss_limit,
    maxTradesPerDay: rules.max_trades_per_day,
    maxOpenPositions: rules.max_open_positions,
    riskPerTradePercent: rules.risk_per_trade_percent,
    sessions: {
      london: rules.session_london_enabled,
      newYork: rules.session_new_york_enabled,
      asian: rules.session_asian_enabled,
      londonNyOverlap: rules.session_london_ny_overlap_enabled,
      customStart: rules.custom_session_start,
      customEnd: rules.custom_session_end,
      timezone: rules.timezone,
    },
  });
}

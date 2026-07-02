import { NextResponse } from "next/server";
import { verifyEaRequest } from "@/lib/ea-auth";
import { createServiceClient } from "@/lib/supabase/service";

// Phase 2 target: the EA polls this every ~60s to pick up rule changes made in
// the dashboard without restarting. Phase 1 ships the shape; nothing polls it yet.
export async function GET(request: Request) {
  const auth = await verifyEaRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: rules } = await supabase
    .from("trading_rules")
    .select("*")
    .eq("account_id", auth.accountId)
    .maybeSingle();

  if (!rules) {
    return NextResponse.json({ configured: false });
  }

  return NextResponse.json({
    configured: true,
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

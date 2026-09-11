import { NextResponse } from "next/server";
import { verifyEaRequest, eaFailureResponse } from "@/lib/ea-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { shapeConfig } from "@/lib/ea-payload";
import { log } from "@/lib/log";

// Superseded by POST /api/ea/sync, which does this plus the ping and the
// equity report in one call. Kept because EAs already installed on traders'
// own PCs still call it and we cannot force an upgrade; the response body is
// built by the same shapeConfig() the merged route uses.
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

  return NextResponse.json(shapeConfig(rules));
}

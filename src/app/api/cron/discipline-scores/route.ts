import { NextResponse } from "next/server";
import { subDays } from "date-fns";
import { createServiceClient } from "@/lib/supabase/service";
import { disciplineFromViolationCounts } from "@/lib/discipline-score";
import { zonedDateKey } from "@/lib/time-boundaries";
import type { ViolationType } from "@/lib/supabase/database.types";

function zeroCounts(): Record<ViolationType, number> {
  return {
    OVERTRADING: 0,
    OUTSIDE_SESSION: 0,
    DAILY_LOSS_BREACH: 0,
    OPEN_POSITIONS_BREACH: 0,
    RISK_PER_TRADE_BREACH: 0,
  };
}

// Daily job (vercel.json crons): persist one discipline_scores row per account.
// getDisciplineScore() already prefers a persisted row over its live estimate,
// so this changes no dashboard code — it just makes the score durable history.
// Vercel invokes cron paths with Authorization: Bearer ${CRON_SECRET}.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createServiceClient();
  const since = subDays(new Date(), 30).toISOString();

  const [accountsRes, rulesRes, violationsRes] = await Promise.all([
    supabase.from("accounts").select("id, user_id"),
    supabase.from("trading_rules").select("account_id, timezone"),
    supabase.from("violations").select("account_id, type").gte("occurred_at", since),
  ]);
  const fetchError = accountsRes.error ?? rulesRes.error ?? violationsRes.error;
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const timezoneByAccount = new Map(
    (rulesRes.data ?? []).map((r) => [r.account_id, r.timezone])
  );
  const countsByAccount = new Map<string, Record<ViolationType, number>>();
  for (const v of violationsRes.data ?? []) {
    const counts = countsByAccount.get(v.account_id) ?? zeroCounts();
    counts[v.type] += 1;
    countsByAccount.set(v.account_id, counts);
  }

  const now = new Date();
  const rows = (accountsRes.data ?? []).map((account) => {
    const factors = disciplineFromViolationCounts(countsByAccount.get(account.id) ?? zeroCounts());
    return {
      user_id: account.user_id,
      account_id: account.id,
      // Each account's row is keyed to *its* local calendar date.
      score_date: zonedDateKey(timezoneByAccount.get(account.id) ?? "UTC", now),
      rule_adherence_score: factors.ruleAdherence,
      session_adherence_score: factors.sessionAdherence,
      overtrading_prevention_score: factors.overtradingPrevention,
      risk_management_score: factors.riskManagement,
      total_score: factors.total,
      computed_at: now.toISOString(),
    };
  });

  if (rows.length > 0) {
    const { error } = await supabase
      .from("discipline_scores")
      .upsert(rows, { onConflict: "account_id,score_date" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, accounts: rows.length });
}

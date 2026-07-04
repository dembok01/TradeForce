import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { subDays } from "date-fns";
import { createServiceClient } from "@/lib/supabase/service";
import { disciplineFromViolationCounts } from "@/lib/discipline-score";
import { zonedDateKey } from "@/lib/time-boundaries";
import { log } from "@/lib/log";
import type { ViolationType } from "@/lib/supabase/database.types";

const ACCOUNT_BATCH = 500;
const SNAPSHOT_RETENTION_DAYS = 90;

function zeroCounts(): Record<ViolationType, number> {
  return {
    OVERTRADING: 0,
    OUTSIDE_SESSION: 0,
    DAILY_LOSS_BREACH: 0,
    OPEN_POSITIONS_BREACH: 0,
    RISK_PER_TRADE_BREACH: 0,
  };
}

function secretMatches(header: string | null, secret: string): boolean {
  const presented = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

// Hourly job (vercel.json crons): upsert each account's discipline_scores row
// for *its own* local calendar date. Running hourly (not once at a fixed UTC
// time) is what makes the local date correct in every timezone — a 00:30 UTC
// daily run would stamp yesterday's date for behind-UTC accounts — and it
// keeps the persisted score fresh as the day's violations accumulate.
// getDisciplineScore() prefers a persisted row over its live estimate, so this
// changes no dashboard code. The same job prunes account_snapshots history.
// Vercel invokes cron paths with Authorization: Bearer ${CRON_SECRET}.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !secretMatches(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createServiceClient();
  const since = subDays(new Date(), 30).toISOString();
  const now = new Date();
  let processed = 0;

  for (let offset = 0; ; offset += ACCOUNT_BATCH) {
    const { data: accounts, error: accountsError } = await supabase
      .from("accounts")
      .select("id, user_id")
      .order("id")
      .range(offset, offset + ACCOUNT_BATCH - 1);
    if (accountsError) {
      log.error("cron accounts fetch failed", { detail: accountsError.message, offset });
      return NextResponse.json({ error: "Failed to load accounts." }, { status: 500 });
    }
    if (!accounts || accounts.length === 0) break;

    const ids = accounts.map((a) => a.id);
    const [rulesRes, violationsRes] = await Promise.all([
      supabase.from("trading_rules").select("account_id, timezone").in("account_id", ids),
      supabase
        .from("violations")
        .select("account_id, type")
        .in("account_id", ids)
        .gte("occurred_at", since),
    ]);
    const fetchError = rulesRes.error ?? violationsRes.error;
    if (fetchError) {
      log.error("cron rules/violations fetch failed", { detail: fetchError.message, offset });
      return NextResponse.json({ error: "Failed to load rule data." }, { status: 500 });
    }

    const timezoneByAccount = new Map((rulesRes.data ?? []).map((r) => [r.account_id, r.timezone]));
    const countsByAccount = new Map<string, Record<ViolationType, number>>();
    for (const v of violationsRes.data ?? []) {
      const counts = countsByAccount.get(v.account_id) ?? zeroCounts();
      counts[v.type] += 1;
      countsByAccount.set(v.account_id, counts);
    }

    const rows = accounts.map((account) => {
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

    const { error: upsertError } = await supabase
      .from("discipline_scores")
      .upsert(rows, { onConflict: "account_id,score_date" });
    if (upsertError) {
      log.error("cron score upsert failed", { detail: upsertError.message, offset });
      return NextResponse.json({ error: "Failed to persist scores." }, { status: 500 });
    }

    processed += accounts.length;
    if (accounts.length < ACCOUNT_BATCH) break;
  }

  // Equity history retention: the sparkline reads day-scale windows; anything
  // older than the retention window is dead weight growing without bound.
  const retentionCutoff = subDays(now, SNAPSHOT_RETENTION_DAYS).toISOString();
  const { error: pruneError } = await supabase
    .from("account_snapshots")
    .delete()
    .lt("recorded_at", retentionCutoff);
  if (pruneError) {
    // Non-fatal: scores are written; retention catches up on the next run.
    log.warn("cron snapshot prune failed", { detail: pruneError.message });
  }

  return NextResponse.json({ ok: true, accounts: processed });
}

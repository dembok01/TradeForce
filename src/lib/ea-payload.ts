import "server-only";
import { z } from "zod";
import { EA_REPORT_BOUNDS } from "@/lib/schemas/trade";
import type { Database, EaEventType, ViolationType } from "@/lib/supabase/database.types";
import type { createServiceClient } from "@/lib/supabase/service";

type Rules = Database["public"]["Tables"]["trading_rules"]["Row"];
type Service = ReturnType<typeof createServiceClient>;

/**
 * Shared between /api/ea/account, /api/ea/config and /api/ea/sync.
 *
 * /api/ea/sync merges all three into one call. The old endpoints stay because
 * EAs already installed on traders' own PCs still use them and we cannot force
 * an upgrade — but every byte of their behaviour is defined here exactly once,
 * so the merged route can never drift from the routes it replaces.
 *
 * Hosted EAs don't call these routes at all: they hand the same JSON bodies to
 * the pool agent as files (infra/pool-agent/tf_bridge.py), which re-implements
 * these schemas in Python. infra/pool-agent/contract/ea-payloads.json holds the
 * cases both implementations are tested against, so they cannot drift either.
 */

export const eaReportSchema = z.object({
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
  // v1.27+: why the EA cannot trade right now ("" = it can). A plain string, not
  // an enum, so a code added in a later EA never fails the whole report.
  tradeBlock: z.string().max(32).optional(),
});

/** /api/ea/sync additionally carries the config version the EA already holds. */
export const eaSyncSchema = eaReportSchema.extend({
  // -1 (or absent) means "I have nothing" — send the full config.
  knownConfigVersion: z.number().int().min(-1).max(2_147_483_647).optional(),
});

export type EaReport = z.infer<typeof eaReportSchema>;

const VIOLATION_TYPES = [
  "OVERTRADING",
  "OUTSIDE_SESSION",
  "DAILY_LOSS_BREACH",
  "OPEN_POSITIONS_BREACH",
  "RISK_PER_TRADE_BREACH",
] as const satisfies readonly ViolationType[];

const EA_EVENT_TYPES = ["EA_REMOVED", "CONNECTION_LOST"] as const satisfies readonly EaEventType[];

const eaDetails = z
  .record(z.string(), z.unknown())
  .refine((d) => JSON.stringify(d).length <= 2_000, "details too large")
  .optional();

const eaOccurredAt = z
  .string()
  .refine((v) => Number.isFinite(Date.parse(v)), "Invalid occurredAt.")
  .optional();

/** POST /api/ea/violations */
export const eaViolationReportSchema = z.object({
  type: z.enum(VIOLATION_TYPES),
  details: eaDetails,
  occurredAt: eaOccurredAt,
  tradeId: z.uuid().nullable().optional(),
  // Deterministic id the EA derives from the triggering event (e.g.
  // type + deal ticket, or type + local day for daily-loss). When present,
  // (account, eventId) is the idempotency key for retried reports.
  eventId: z.string().trim().min(1).max(64).optional(),
});

/** POST /api/ea/events */
export const eaEventSchema = z.object({
  type: z.enum(EA_EVENT_TYPES),
  details: eaDetails,
  occurredAt: eaOccurredAt,
});

export function shapeConfig(rules: Rules) {
  return {
    configured: true as const,
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
  };
}

/**
 * Two writes per report: the in-place accounts row the dashboard tiles read,
 * and an append-only account_snapshots row — equity *history* can't be
 * backfilled later. The ops console also reads gaps between snapshots as EA
 * downtime, so this cadence is load-bearing for monitoring, not just charts.
 */
export async function recordAccountReport(
  supabase: Service,
  auth: { userId: string; accountId: string },
  d: EaReport,
): Promise<{ error: string | null }> {
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
        current_equity: d.equity,
        ...(d.balance !== undefined && d.balance !== null ? { starting_balance: d.balance } : {}),
        ...(d.tradeBlock !== undefined ? { ea_trade_block: d.tradeBlock || null } : {}),
      })
      .eq("id", auth.accountId),
    supabase.from("account_snapshots").insert({
      user_id: auth.userId,
      account_id: auth.accountId,
      equity: d.equity,
      balance: d.balance ?? null,
    }),
  ]);

  // Telemetry is best-effort: never fail an equity report because the ops
  // columns didn't write.
  await telemetry;

  return { error: (updateRes.error ?? snapshotRes.error)?.message ?? null };
}

import "server-only";
import { getAccountContext } from "@/lib/data/context";
import { countExact, resolveAccountTimezone } from "@/lib/data/_shared";
import { zonedStartOfWeek, zonedStartOfMonth } from "@/lib/time-boundaries";
import type { Database } from "@/lib/supabase/database.types";

export type Violation = Database["public"]["Tables"]["violations"]["Row"];

export type ViolationsOverview = {
  recent: Violation[];
  countThisWeek: number;
  countThisMonth: number;
};

export const VIOLATION_LABELS: Record<Violation["type"], string> = {
  OVERTRADING: "Overtrading",
  OUTSIDE_SESSION: "Outside session",
  DAILY_LOSS_BREACH: "Daily loss breach",
  OPEN_POSITIONS_BREACH: "Open positions breach",
  RISK_PER_TRADE_BREACH: "Risk per trade breach",
};

export async function getViolationsOverview(): Promise<ViolationsOverview> {
  const { supabase, account } = await getAccountContext();
  const timezone = await resolveAccountTimezone(supabase, account);
  const weekStart = zonedStartOfWeek(timezone).toISOString();
  const monthStart = zonedStartOfMonth(timezone).toISOString();

  const [recentRes, countThisWeek, countThisMonth] = await Promise.all([
    supabase
      .from("violations")
      .select("*")
      .eq("account_id", account.id)
      .order("occurred_at", { ascending: false })
      .limit(50),
    countExact(() =>
      supabase
        .from("violations")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account.id)
        .gte("occurred_at", weekStart)
    ),
    countExact(() =>
      supabase
        .from("violations")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account.id)
        .gte("occurred_at", monthStart)
    ),
  ]);
  if (recentRes.error) throw new Error(recentRes.error.message);

  return {
    recent: recentRes.data ?? [],
    countThisWeek,
    countThisMonth,
  };
}

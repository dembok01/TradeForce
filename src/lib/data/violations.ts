import "server-only";
import { startOfWeek, startOfMonth } from "date-fns";
import { getAccountContext } from "@/lib/data/context";
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
  const weekStart = startOfWeek(new Date()).toISOString();
  const monthStart = startOfMonth(new Date()).toISOString();

  const [recentRes, weekRes, monthRes] = await Promise.all([
    supabase
      .from("violations")
      .select("*")
      .eq("account_id", account.id)
      .order("occurred_at", { ascending: false })
      .limit(50),
    supabase
      .from("violations")
      .select("id", { count: "exact", head: true })
      .eq("account_id", account.id)
      .gte("occurred_at", weekStart),
    supabase
      .from("violations")
      .select("id", { count: "exact", head: true })
      .eq("account_id", account.id)
      .gte("occurred_at", monthStart),
  ]);

  return {
    recent: recentRes.data ?? [],
    countThisWeek: weekRes.count ?? 0,
    countThisMonth: monthRes.count ?? 0,
  };
}

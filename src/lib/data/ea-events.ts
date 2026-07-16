import "server-only";
import { cache } from "react";
import { getAccountContext } from "@/lib/data/context";
import { getRequestTimezone } from "@/lib/data/rules";
import { zonedStartOfDay } from "@/lib/time-boundaries";

export type EaIncident = { removedAt: string | null; lossLockedToday: boolean };

/**
 * The two facts that turn a vague "EA offline" dot into a truthful state:
 * was the EA removed from the chart (latest ea_events row), and did today's
 * daily-loss lock fire (in which case a closed terminal is the EA working,
 * not the EA missing). Only worth consulting when the heartbeat is stale.
 * Errors degrade to "no incident" - this powers a status dot, not a gate.
 */
export const getEaIncident = cache(async (): Promise<EaIncident> => {
  const { supabase, account } = await getAccountContext();
  const tz = await getRequestTimezone();

  const [removed, breach] = await Promise.all([
    supabase
      .from("ea_events")
      .select("occurred_at")
      .eq("account_id", account.id)
      .eq("event_type", "EA_REMOVED")
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("violations")
      .select("id")
      .eq("account_id", account.id)
      .eq("type", "DAILY_LOSS_BREACH")
      .gte("occurred_at", zonedStartOfDay(tz).toISOString())
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    removedAt: removed.error ? null : (removed.data?.occurred_at ?? null),
    lossLockedToday: !breach.error && Boolean(breach.data),
  };
});

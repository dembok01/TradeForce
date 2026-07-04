"use client";

import { useEffect, useState } from "react";
import { addDays, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { Lock } from "lucide-react";
import { nextSessionEdge } from "@/lib/trading-sessions";
import { formatCurrency } from "@/lib/format";
import type { AccountStatus } from "@/lib/risk-status";
import { cn } from "@/lib/utils";

const TZ_SHORT: Record<string, string> = {
  "Asia/Kolkata": "IST",
  UTC: "UTC",
  "America/New_York": "ET",
};

function formatDuration(minutes: number): string {
  const clamped = Math.max(0, minutes);
  const h = Math.floor(clamped / 60);
  const m = Math.round(clamped % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export type SessionWindow = { label: string; startUtc: number; endUtc: number };

/**
 * Headroom framing, not usage framing: what's LEFT today — trades, loss
 * budget, session time — with countdowns on the trader's own clock. When the
 * account is locked, the strip becomes the lock: a page-level state change,
 * not a badge.
 */
export function TodayStrip({
  timezone,
  status,
  tradesRemaining,
  lossHeadroom,
  sessions,
}: {
  timezone: string;
  status: AccountStatus;
  tradesRemaining: number | null;
  lossHeadroom: number | null;
  sessions: SessionWindow[];
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Minutes to the next local midnight — the moment every daily rule resets.
  const wallNow = toZonedTime(now, timezone);
  const nextMidnightUtc = fromZonedTime(addDays(startOfDay(wallNow), 1), timezone);
  const resetMinutes = (nextMidnightUtc.getTime() - now.getTime()) / 60_000;
  const tzShort = TZ_SHORT[timezone] ?? timezone;

  const edge = nextSessionEdge(sessions, now);
  const locked = status === "locked";

  if (locked) {
    return (
      <div
        className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-destructive/40 bg-destructive/10 px-5 py-4"
        suppressHydrationWarning
      >
        <Lock className="size-4 shrink-0 text-destructive" />
        <p className="font-display text-base font-medium text-destructive">Account locked.</p>
        <p className="text-sm text-destructive/80">
          Daily loss limit breached — trading resumes in {formatDuration(resetMinutes)} (midnight{" "}
          {tzShort}).
        </p>
      </div>
    );
  }

  const chips: { label: string; value: string; warn?: boolean }[] = [];
  if (tradesRemaining !== null) {
    chips.push({
      label: "trades left today",
      value: String(tradesRemaining),
      warn: tradesRemaining <= 1,
    });
  }
  if (lossHeadroom !== null) {
    chips.push({
      label: "loss headroom",
      value: formatCurrency(lossHeadroom),
      warn: status === "warning",
    });
  }
  if (edge) {
    chips.push({ label: `${edge.label} ${edge.kind} in`, value: formatDuration(edge.minutes) });
  }
  chips.push({ label: `resets midnight ${tzShort}`, value: formatDuration(resetMinutes) });

  if (chips.length === 0) return null;

  return (
    <div
      className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card/60 px-5 py-3"
      suppressHydrationWarning
    >
      {chips.map((chip) => (
        <div key={chip.label} className="flex items-baseline gap-2">
          <span
            className={cn(
              "font-mono-tabular text-sm font-medium",
              chip.warn ? "text-warning" : "text-foreground"
            )}
          >
            {chip.value}
          </span>
          <span className="text-xs text-muted-foreground">{chip.label}</span>
        </div>
      ))}
    </div>
  );
}

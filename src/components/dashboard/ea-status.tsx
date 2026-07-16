"use client";

import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils";

export type EaState = "live" | "stale" | "never" | "removed" | "locked";

const STATE_CONFIG: Record<EaState, { label: string; dot: string; pulse: boolean; hint?: string }> = {
  live: { label: "EA live", dot: "bg-success", pulse: true },
  stale: { label: "EA offline", dot: "bg-warning", pulse: false },
  never: { label: "EA not connected", dot: "bg-muted-foreground/50", pulse: false },
  removed: {
    label: "EA was removed",
    dot: "bg-destructive",
    pulse: false,
    hint: "The EA was removed from the MT5 chart — nothing is enforcing your rules. Re-attach it to restore protection.",
  },
  locked: {
    label: "EA locked (daily loss)",
    dot: "bg-warning",
    pulse: false,
    hint: "Your daily loss limit hit, so the EA closed MT5 by design. Trading resumes after your local midnight.",
  },
};

/**
 * The always-visible answer to "is it actually running?" — a live/stale/never
 * dot in the shell, on every page, linking to EA Setup.
 */
export function EaStatusDot({
  state,
  lastSeenAt,
  className,
}: {
  state: EaState;
  lastSeenAt: string | null;
  className?: string;
}) {
  const config = STATE_CONFIG[state];
  return (
    <Link
      href="/dashboard/ea-setup"
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
        className
      )}
      title={
        config.hint ??
        (lastSeenAt
          ? `Last check-in ${formatDistanceToNowStrict(new Date(lastSeenAt), { addSuffix: true })}`
          : "The EA has never checked in")
      }
    >
      <span className="relative flex size-2">
        {config.pulse && (
          <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", config.dot)} />
        )}
        <span className={cn("relative inline-flex size-2 rounded-full", config.dot)} />
      </span>
      {config.label}
    </Link>
  );
}

import { Lock } from "lucide-react";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import type { DayLock } from "@/lib/risk-status";
import { safeTimezone } from "@/lib/time-boundaries";

/**
 * "Locked for the day" said plainly. The status badge already turns red, but a
 * trader whose terminal stopped them needs to know three things: that it was
 * their own rule, what happens if they trade anyway, and when it lifts. A
 * hosted terminal keeps running through the lock (EA v1.29), so this is a
 * healthy state, not a fault - the wording says so.
 */
export function DayLockBanner({ lock, timezone }: { lock: DayLock; timezone: string }) {
  const tz = safeTimezone(timezone);
  const at = (iso: string) => format(toZonedTime(new Date(iso), tz), "HH:mm");
  const daily = lock.reason === "daily_loss";

  return (
    <div role="status" className="rounded-xl border border-destructive/40 bg-destructive/10 p-5">
      <p className="flex items-center gap-2 font-display text-base font-medium text-destructive">
        <Lock className="size-4 shrink-0" aria-hidden />
        {daily ? "Locked for the day — you hit your daily loss limit" : "No more trades today — you've used your daily limit"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {daily && lock.since
          ? `TradeForce closed your open trades at ${at(lock.since)} and stopped trading for the rest of the day. `
          : "TradeForce has stopped trading for the rest of the day. "}
        Anything you open now — on any device — is closed straight away and logged as a violation.
        Trading opens again at midnight ({at(lock.endsAt)}, {tz}).
      </p>
    </div>
  );
}

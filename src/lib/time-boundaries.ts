import { startOfDay, startOfWeek, startOfMonth, addDays, format } from "date-fns";
import { fromZonedTime, getTimezoneOffset, toZonedTime } from "date-fns-tz";

// "Today" must roll over at the trader's midnight, not the server's. Every
// daily/weekly/monthly boundary in the data layer goes through these helpers
// with the account's configured timezone (any IANA name, see timezoneOptions());
// a Vercel server clock is UTC, which is 05:30 for the default IST trader.
// Pure module (no server-only) so it can be unit-tested directly.

export function safeTimezone(candidate: string | null | undefined): string {
  if (!candidate) return "UTC";
  // V8's zone list only has the old alias, but EAs before 1.31 look IST up
  // by its current name - store that one.
  if (candidate === "Asia/Calcutta") return "Asia/Kolkata";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return "UTC";
  }
}

// The wall-clock trick: shift the instant into the zone's wall time, take the
// boundary there, then convert that wall time back to a UTC instant.
function zonedBoundary(
  timeZone: string,
  now: Date,
  boundary: (wallClock: Date) => Date
): Date {
  const tz = safeTimezone(timeZone);
  return fromZonedTime(boundary(toZonedTime(now, tz)), tz);
}

/** UTC instant of the zone's most recent midnight. */
export function zonedStartOfDay(timeZone: string, now = new Date()): Date {
  return zonedBoundary(timeZone, now, startOfDay);
}

/** UTC instant of the zone's most recent start of week (Sunday, date-fns default). */
export function zonedStartOfWeek(timeZone: string, now = new Date()): Date {
  return zonedBoundary(timeZone, now, startOfWeek);
}

/** UTC instant of the zone's most recent first-of-month midnight. */
export function zonedStartOfMonth(timeZone: string, now = new Date()): Date {
  return zonedBoundary(timeZone, now, startOfMonth);
}

/** UTC instant of the zone's next midnight - when a locked trading day lifts. */
export function zonedNextMidnight(timeZone: string, now = new Date()): Date {
  return zonedBoundary(timeZone, now, (wall) => startOfDay(addDays(wall, 1)));
}

/** The zone's current calendar date as "yyyy-MM-dd" (discipline_scores.score_date key). */
export function zonedDateKey(timeZone: string, now = new Date()): string {
  return format(toZonedTime(now, safeTimezone(timeZone)), "yyyy-MM-dd");
}

/** Minutes the zone is ahead of UTC at `now` (IST = 330, New York = -240/-300). */
export function utcOffsetMinutes(timeZone: string, now = new Date()): number {
  return Math.round(getTimezoneOffset(safeTimezone(timeZone), now) / 60_000);
}

const TZ_ABBREV: Record<string, string> = {
  "Asia/Kolkata": "IST",
  UTC: "UTC",
  "America/New_York": "ET",
};

/** Short zone label for copy: "IST", "UTC", "ET", else Intl's own ("GMT+4", "PDT"). */
export function timezoneAbbrev(timeZone: string, now = new Date()): string {
  const tz = safeTimezone(timeZone);
  return (
    TZ_ABBREV[tz] ??
    new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value ??
    tz
  );
}

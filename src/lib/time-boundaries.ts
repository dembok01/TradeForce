import { startOfDay, startOfWeek, startOfMonth, addDays, format } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

// "Today" must roll over at the trader's midnight, not the server's. Every
// daily/weekly/monthly boundary in the data layer goes through these helpers
// with the account's configured timezone (an IANA name from TIMEZONE_OPTIONS);
// a Vercel server clock is UTC, which is 05:30 for the default IST trader.
// Pure module (no server-only) so it can be unit-tested directly.

export function safeTimezone(candidate: string | null | undefined): string {
  if (!candidate) return "UTC";
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

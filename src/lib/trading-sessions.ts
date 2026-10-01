import { safeTimezone, timezoneAbbrev, utcOffsetMinutes } from "@/lib/time-boundaries";

// Reference session windows in UTC hours (approximate, standard forex convention).
// Good enough for Phase 1's "is a session active right now" indicator; Phase 2 can
// refine with exact exchange calendars/DST handling once the EA is the source of truth.
export const SESSION_WINDOWS = {
  london: { label: "London", startUtc: 8, endUtc: 16.5 },
  newYork: { label: "New York", startUtc: 13, endUtc: 22 },
  asian: { label: "Asian", startUtc: 0, endUtc: 9 },
  londonNyOverlap: { label: "London / New York overlap", startUtc: 13, endUtc: 16.5 },
} as const;

export type SessionKey = keyof typeof SESSION_WINDOWS;

export function isWithinUtcWindow(startUtc: number, endUtc: number, now = new Date()): boolean {
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60;
  if (startUtc <= endUtc) {
    return hour >= startUtc && hour < endUtc;
  }
  // Window wraps past midnight UTC.
  return hour >= startUtc || hour < endUtc;
}

export function isCustomWindowActive(
  startTime: string | null,
  endTime: string | null,
  now = new Date()
): boolean {
  if (!startTime || !endTime) return false;
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  return isWithinUtcWindow(startH + startM / 60, endH + endM / 60, now);
}

/** "HH:MM[:SS]" (stored as UTC wall time) → fractional UTC hours. */
export function parseTimeToUtcHours(time: string): number {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h + m / 60;
}

export type SessionEdge = { label: string; kind: "closes" | "opens"; minutes: number };

/**
 * The next meaningful session boundary: if any window is active, the soonest
 * close; otherwise the soonest open (wrapping past midnight UTC). Null when
 * no windows are configured.
 */
export function nextSessionEdge(
  sessions: { label: string; startUtc: number; endUtc: number }[],
  now = new Date()
): SessionEdge | null {
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60;
  let closes: SessionEdge | null = null;
  let opens: SessionEdge | null = null;

  for (const s of sessions) {
    if (isWithinUtcWindow(s.startUtc, s.endUtc, now)) {
      let delta = s.endUtc - hour;
      if (delta < 0) delta += 24;
      const minutes = Math.round(delta * 60);
      if (!closes || minutes < closes.minutes) closes = { label: s.label, kind: "closes", minutes };
    } else {
      let delta = s.startUtc - hour;
      if (delta < 0) delta += 24;
      const minutes = Math.round(delta * 60);
      if (!opens || minutes < opens.minutes) opens = { label: s.label, kind: "opens", minutes };
    }
  }
  return closes ?? opens;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Fractional hours -> "HH:MM", wrapping past midnight either way. */
function hoursToHhmm(hours: number): string {
  const total = ((Math.round(hours * 60) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

// The custom window is STORED as UTC wall time, because that is what every EA
// ever shipped enforces. Traders type and read it on their own clock, so the
// forms convert at the edge and nothing downstream changes.
// ponytail: the offset is taken at `now`, so in a DST zone a saved window stays
// put in UTC and moves an hour on the local clock at the switch - the preset
// sessions behave the same way. Store local time and convert per request (and
// bump config_version at each switch) if DST traders need it pinned.

/** "09:00" typed in `timeZone` -> the "HH:MM" UTC wall time to store. */
export function localTimeToUtc(time: string, timeZone: string, now = new Date()): string {
  return hoursToHhmm(parseTimeToUtcHours(time) - utcOffsetMinutes(timeZone, now) / 60);
}

/** A stored UTC "HH:MM[:SS]" -> "HH:MM" on the trader's clock. */
export function utcTimeToLocal(time: string, timeZone: string, now = new Date()): string {
  return hoursToHhmm(parseTimeToUtcHours(time) + utcOffsetMinutes(timeZone, now) / 60);
}

/** A UTC window on the trader's clock: "13:30–22:00 IST". */
export function formatWindowLocal(
  startUtc: number,
  endUtc: number,
  timeZone: string,
  now = new Date()
): string {
  const offset = utcOffsetMinutes(timeZone, now) / 60;
  return `${hoursToHhmm(startUtc + offset)}–${hoursToHhmm(endUtc + offset)} ${timezoneAbbrev(timeZone, now)}`;
}

function gmtLabel(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  return `GMT${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

// The three the product launched with stay on top.
const PINNED_TIMEZONES = ["Asia/Kolkata", "UTC", "America/New_York"];

/**
 * Every IANA zone the runtime knows, pinned ones first, each labelled with its
 * current GMT offset. `include` keeps an already-saved zone selectable even if
 * this runtime doesn't list it.
 */
export function timezoneOptions(include?: string, now = new Date()): { value: string; label: string }[] {
  const known = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  // safeTimezone folds Asia/Calcutta into the pinned Asia/Kolkata; dedupe after.
  const zones = [...new Set([...PINNED_TIMEZONES, ...known].map(safeTimezone))];
  if (include && !zones.includes(safeTimezone(include))) zones.unshift(safeTimezone(include));
  return zones.map((value) => ({
    value,
    label: `${value.replaceAll("_", " ")} (${gmtLabel(utcOffsetMinutes(value, now))})`,
  }));
}

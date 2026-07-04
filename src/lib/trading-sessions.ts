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

export const TIMEZONE_OPTIONS = [
  { value: "Asia/Kolkata", label: "IST — India Standard Time" },
  { value: "UTC", label: "GMT / UTC — Greenwich Mean Time" },
  { value: "America/New_York", label: "EST — Eastern Standard Time" },
];

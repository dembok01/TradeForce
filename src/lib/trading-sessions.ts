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

export const TIMEZONE_OPTIONS = [
  { value: "Asia/Kolkata", label: "IST — India Standard Time" },
  { value: "UTC", label: "GMT / UTC — Greenwich Mean Time" },
  { value: "America/New_York", label: "EST — Eastern Standard Time" },
];

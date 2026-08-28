/**
 * Health rules for the ops console.
 *
 * Deliberately NOT based on load average: we measured load 14.01 on a 4-core
 * box with every EA perfectly healthy and iowait at zero. Alerting on it would
 * only teach the operator to ignore alerts.
 */
export const EA_STALE_MS = 5 * 60 * 1000;      // dashboard's own freshness window
export const EA_DEAD_MS = 10 * 60 * 1000;      // user is unprotected: page someone
export const SERVER_STALE_MS = 3 * 60 * 1000;  // agent polls every 15s
export const FAILED_FETCH_ALERT = 200;         // per report; a storm is ~3600/hr

export type Health = "ok" | "warn" | "down" | "idle";

export function ageMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Date.now() - new Date(iso).getTime();
}

export function fmtAge(iso: string | null | undefined): string {
  const ms = ageMs(iso);
  if (ms === null) return "never";
  const s = Math.floor(ms / 1000);
  if (s < 90) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 90) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

/** What the EA itself proves, which outranks whatever the agent believes. */
export function eaHealth(lastSeenAt: string | null, desiredState: string): Health {
  if (desiredState !== "running") return "idle";
  const ms = ageMs(lastSeenAt);
  if (ms === null) return "down";
  if (ms > EA_DEAD_MS) return "down";
  if (ms > EA_STALE_MS) return "warn";
  return "ok";
}

export function serverHealth(lastSeenAt: string): Health {
  const ms = ageMs(lastSeenAt);
  return ms !== null && ms > SERVER_STALE_MS ? "down" : "ok";
}

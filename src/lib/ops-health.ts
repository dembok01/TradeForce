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

/**
 * Desktop EAs have no desired_state to compare against — the trader owns the
 * terminal. Silence still matters, but on a much longer fuse: someone who
 * closed MT5 for the night is not an incident.
 */
export function desktopHealth(lastSeenAt: string | null): Health {
  const ms = ageMs(lastSeenAt);
  if (ms === null) return "idle";
  if (ms > 24 * 3600_000) return "down";
  if (ms > 3600_000) return "warn";
  return "ok";
}

/**
 * Uptime over a window, from heartbeat gaps.
 *
 * Gaps are clipped to the window rather than counted whole: a 48-hour outage
 * that started before the window began only cost us the part inside it, and
 * counting it in full can push a 7-day figure below zero.
 */
export function uptimePctFromGaps(
  gaps: { started_at: string; ended_at: string }[],
  windowMs: number,
  now = Date.now(),
): number {
  const cutoff = now - windowMs;
  const down = gaps.reduce((n, g) => {
    const s = Math.max(new Date(g.started_at).getTime(), cutoff);
    const e = Math.min(new Date(g.ended_at).getTime(), now);
    return e > s ? n + (e - s) : n;
  }, 0);
  return Math.round(Math.max(0, 1 - down / windowMs) * 10000) / 100;
}

/**
 * How many more hosted users the disk can take.
 *
 * Disk, not CPU, is what runs out first on the current pool: each user gets a
 * full ~3 GB copy of MetaTrader. Provisioning a user with no room left fails
 * part-way and leaves a half-built terminal, so this is the number to check
 * before raising the capacity setting.
 */
export const DISK_PER_USER_MB = 3000;
export const DISK_RESERVE_MB = 8000;   // logs, history growth, an image pull

export function diskHeadroomUsers(
  diskFreeMb: number | null,
  perUserMb = DISK_PER_USER_MB,
  reserveMb = DISK_RESERVE_MB,
): number | null {
  if (diskFreeMb === null) return null;
  return Math.max(0, Math.floor((diskFreeMb - reserveMb) / perUserMb));
}

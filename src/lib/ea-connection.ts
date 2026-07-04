// EA-connection liveness, from api_keys.last_used_at (every EA request stamps
// it). Two windows on purpose:
// - CONNECTED: a healthy EA authenticates at least once a minute, so a few
//   minutes of silence means the terminal stopped reporting (dashboard tile).
// - ACTIVE: manual journal entry stays off while an EA has reported within the
//   last day, and self-heals back on if the EA is uninstalled or goes silent —
//   the journal is never left unusable.
export const EA_CONNECTED_WINDOW_MS = 5 * 60 * 1000;
export const EA_ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function eaSeenWithin(
  lastSeenAt: string | null,
  windowMs: number,
  now = Date.now()
): boolean {
  if (!lastSeenAt) return false;
  const seen = Date.parse(lastSeenAt);
  return Number.isFinite(seen) && now - seen < windowMs;
}

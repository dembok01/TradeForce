/**
 * Who has paid, and until when.
 *
 * Entitlement is derived from `profiles.plan_expires_at` against the clock
 * rather than stored as a flag somebody has to flip. A lapsed plan therefore
 * lapses on its own: there is no nightly job to schedule, nothing to fail
 * quietly at 3am, and no window where a trader is billed-but-locked-out or
 * expired-but-still-in.
 */
export type Entitlement = {
  plan: "free" | "paid";
  /** Paid *and* still inside the period. This is the one to gate on. */
  active: boolean;
  expiresAt: Date | null;
  /** Whole days left, floored at 0. Null when nothing was ever bought. */
  daysLeft: number | null;
};

const DAY_MS = 86_400_000;

export function entitlementFrom(
  plan: string | null | undefined,
  expiresAt: string | Date | null | undefined,
  now: Date = new Date()
): Entitlement {
  const expiry = expiresAt ? new Date(expiresAt) : null;
  const valid = expiry && !Number.isNaN(expiry.getTime()) ? expiry : null;
  return {
    plan: plan === "paid" ? "paid" : "free",
    active: plan === "paid" && valid !== null && valid.getTime() > now.getTime(),
    expiresAt: valid,
    // Ceil, not floor: someone with four hours left has a day left, and
    // rounding them out early is the kind of thing that generates a refund.
    daysLeft: valid ? Math.max(0, Math.ceil((valid.getTime() - now.getTime()) / DAY_MS)) : null,
  };
}

/**
 * Month arithmetic in UTC, clamped to the last day of the target month, so
 * 31 January plus one month is 28 February rather than 3 March.
 *
 * Deliberately not date-fns `addMonths`: that works in the server's local
 * zone, and the one number in this system that must not wobble with where it
 * runs is the moment a trader's paid access ends.
 */
function addMonthsUtc(from: Date, months: number): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + months;
  const lastDayOfTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const out = new Date(from.getTime());
  out.setUTCFullYear(year, month, Math.min(from.getUTCDate(), lastDayOfTarget));
  return out;
}

/**
 * Where a paid period should end once `months` more are bought.
 *
 * Stacks on a period still running, so paying early never costs the trader the
 * days they already own. Runs from today when the old period is already dead,
 * so nobody buys a month that expired last August.
 */
export function extendedExpiry(current: Date | null, months: number, now: Date = new Date()): Date {
  if (!Number.isInteger(months) || months <= 0) {
    throw new Error(`A paid period must be a positive whole number of months, got ${months}.`);
  }
  const stillRunning = current !== null && current.getTime() > now.getTime();
  return addMonthsUtc(stillRunning ? current : now, months);
}

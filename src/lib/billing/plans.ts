/**
 * What TradeForce sells and what it costs, in one place.
 *
 * The landing page advertises $13/month; ₹1,249 is what the UPI QR actually
 * carries. They are two renderings of one price and both are here so they
 * cannot drift apart.
 *
 * The 3- and 12-month figures are roughly 10% and 20% off. Longer periods are
 * the only lever against the cost of this payment flow — every payment needs a
 * human to check GPay and approve it, so a trader on twelve months is one
 * approval a year instead of twelve.
 */
export const PAID_PLAN = "paid";

/** Shown on the pricing card. The rupee figures below are what is charged. */
export const DISPLAY_PRICE_USD = 13;

export type Period = {
  months: number;
  amountInr: number;
  label: string;
  /** Marketing line for the chooser, e.g. "save 20%". Empty for the base rate. */
  saving: string;
};

export const PERIODS: Period[] = [
  { months: 1, amountInr: 1249, label: "1 month", saving: "" },
  { months: 3, amountInr: 3399, label: "3 months", saving: "save 9%" },
  { months: 12, amountInr: 11999, label: "12 months", saving: "save 20%" },
];

export function periodFor(months: number): Period | undefined {
  return PERIODS.find((p) => p.months === months);
}

// en-IN groups by lakh and crore (11,00,000), which is what an Indian buyer
// reads. Whole rupees: every price here is whole, and trailing ".00" on a
// payment page reads like a rounding error waiting to happen.
const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatInr(amount: number): string {
  return inr.format(amount);
}

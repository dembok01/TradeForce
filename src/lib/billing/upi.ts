/**
 * The `upi://pay` URI that both the QR and the tap-to-pay button carry.
 *
 * The format is NPCI's UPI Linking Specification, which every Indian UPI app
 * implements: `pa` payee address, `pn` payee name, `am` amount, `cu` currency,
 * `tn` transaction note, `tr` transaction reference.
 *
 * Built by hand rather than with URLSearchParams, which encodes a space as "+".
 * UPI apps do not decode "+" back to a space, so a payee name built that way
 * arrives with plus signs in it — or is rejected outright.
 *
 * Every rejection below is deliberate. A malformed URI does not fail loudly; it
 * renders a QR that scans to a payment nobody can complete, or worse, one that
 * completes to the wrong place. Failing here is the cheap option.
 */
export type UpiPayment = {
  vpa: string;
  name: string;
  amountInr: number;
  reference: string;
};

/**
 * A UPI handle: `something@handle`. Deliberately permissive on the local part
 * (banks allow dots, hyphens, underscores and bare phone numbers) and strict
 * about the shape, because the shape is what catches a half-filled env var.
 */
export function isVpa(value: string): boolean {
  return /^[a-zA-Z0-9.\-_]{1,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,64}$/.test(value);
}

export function buildUpiUri({ vpa, name, amountInr, reference }: UpiPayment): string {
  if (!isVpa(vpa)) {
    throw new Error(`Not a UPI handle: ${JSON.stringify(vpa)}. Expected something like name@bank.`);
  }

  const ref = reference.trim();
  if (!ref) {
    throw new Error("A UPI payment needs a reference — without one there is nothing to match the credit to.");
  }

  if (!Number.isFinite(amountInr) || amountInr <= 0) {
    throw new Error(`A UPI amount must be a positive, finite number of rupees, got ${amountInr}.`);
  }

  // Rupees carry two decimal places and no more. Compared with a tolerance
  // because 1249.5 * 100 is 124950.00000000001 in binary floating point, and
  // rejecting a legitimate price over that would be absurd.
  const paise = Math.round(amountInr * 100);
  if (Math.abs(paise - amountInr * 100) > 1e-6) {
    throw new Error(`A UPI amount cannot be finer than one paisa, got ${amountInr}.`);
  }

  const amount = (paise / 100).toFixed(2);
  const note = `TradeForce ${ref}`;

  return (
    `upi://pay?pa=${encodeURIComponent(vpa)}` +
    `&pn=${encodeURIComponent(name)}` +
    `&am=${amount}` +
    `&cu=INR` +
    `&tn=${encodeURIComponent(note)}` +
    `&tr=${encodeURIComponent(ref)}`
  );
}

import qrcode from "qrcode-generator";

/**
 * The UPI QR, as an inline SVG.
 *
 * Server-rendered rather than drawn in the browser: it costs no client JS, it
 * works before hydration, and it keeps the payment URI out of any third-party
 * image service. (The usual shortcut — an <img> pointing at a public QR API —
 * hands the payee handle and the amount to someone else's server on every
 * render, which is a strange thing to do with a payment instruction.)
 *
 * Error correction M: the level UPI QRs normally use, and enough redundancy
 * for a phone camera reading a screen at an angle.
 */
function encode(uri: string) {
  const qr = qrcode(0, "M");
  qr.addData(uri);
  qr.make();
  return qr;
}

/**
 * The raw module matrix. Exists so the QR can be decoded back by an
 * independent reader in the tests without a browser or a canvas — this is the
 * one artifact in the payment flow nobody reads before paying, so "an SVG came
 * back" is not evidence that it says the right thing.
 */
export type EncodedQr = {
  moduleCount: number;
  isDark: (row: number, col: number) => boolean;
};

export function encodeUpiQr(uri: string): EncodedQr {
  const qr = encode(uri);
  return { moduleCount: qr.getModuleCount(), isDark: (row, col) => qr.isDark(row, col) };
}

export function upiQrSvg(uri: string): string {
  // scalable gives a viewBox and no fixed width, so CSS sizes it; margin 0
  // because the surrounding element supplies the quiet zone as padding.
  return encode(uri).createSvgTag({ cellSize: 1, margin: 0, scalable: true });
}

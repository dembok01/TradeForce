import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { encodeUpiQr, upiQrSvg } from "./qr";
import { buildUpiUri } from "./upi";

/**
 * The QR is the single artifact in this feature that nobody reviews before
 * money moves: a trader points a camera at it and pays whatever it says. A
 * test that only checks "an SVG came back" would not notice if it encoded the
 * wrong payee, so this one decodes the thing with an independent reader and
 * compares the payload to what we meant to say.
 *
 * Pixels are built straight from the module matrix rather than by rasterising
 * the SVG, so the test needs no browser and no canvas.
 */
function render(uri: string, scale = 8, quiet = 4): ImageData {
  const { moduleCount, isDark } = encodeUpiQr(uri);
  const size = (moduleCount + quiet * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (!isDark(row, col)) continue;
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const px = ((quiet + row) * scale + y) * size + ((quiet + col) * scale + x);
          data[px * 4] = 0;
          data[px * 4 + 1] = 0;
          data[px * 4 + 2] = 0;
        }
      }
    }
  }
  return { data, width: size, height: size, colorSpace: "srgb" } as ImageData;
}

function decode(uri: string): string | null {
  const img = render(uri);
  return jsQR(img.data, img.width, img.height)?.data ?? null;
}

describe("the UPI QR a trader actually scans", () => {
  it.each([
    ["one month", { vpa: "tradeforce@okaxis", name: "TradeForce Technologies", amountInr: 1249, reference: "TF-7K3QD2" }],
    ["a year", { vpa: "tradeforce@okaxis", name: "TradeForce Technologies", amountInr: 11999, reference: "TF-X9ZM4P" }],
    ["a phone-number handle", { vpa: "9876543210@ybl", name: "Amal Manoj", amountInr: 3399, reference: "TF-4HJ8QW" }],
  ])("scans back to exactly the payment we built, for %s", (_label, payment) => {
    const uri = buildUpiUri(payment);
    expect(decode(uri)).toBe(uri);
  });

  // The whole point of the amount being in the QR: nobody types it, so nobody
  // mistypes it. If the encoder ever mangled it, this is where we find out.
  it("carries the exact rupee amount into the scanned payload", () => {
    const uri = buildUpiUri({
      vpa: "tradeforce@okaxis",
      name: "TradeForce Technologies",
      amountInr: 1249,
      reference: "TF-AMOUNT",
    });
    const scanned = new URLSearchParams(decode(uri)!.slice("upi://pay?".length));
    expect(scanned.get("am")).toBe("1249.00");
    expect(scanned.get("cu")).toBe("INR");
    expect(scanned.get("pa")).toBe("tradeforce@okaxis");
    expect(scanned.get("tr")).toBe("TF-AMOUNT");
  });

  // The page sizes the QR with a Tailwind width; a hardcoded width attribute on
  // the <svg> would win and the code would render at whatever the encoder
  // chose. Checked on the opening tag alone — the background <rect> carries a
  // legitimate width="100%".
  it("renders an SVG that scales with its box rather than a fixed-size one", () => {
    const svg = upiQrSvg("upi://pay?pa=a@b&pn=X&am=1.00&cu=INR");
    const openTag = svg.slice(0, svg.indexOf(">") + 1);
    expect(openTag).toContain("viewBox");
    expect(openTag).not.toMatch(/\swidth=/);
    expect(openTag).not.toMatch(/\sheight=/);
  });
});

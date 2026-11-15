import { describe, it, expect } from "vitest";
import {
  TERMS,
  TERMS_VERSION,
  TERMS_EFFECTIVE,
  TERMS_HIGHLIGHTS,
  PAYMENT_DISCLAIMER,
} from "./terms";

describe("TERMS_VERSION", () => {
  // The version is stamped into profiles.terms_version at signup. A free-form
  // string would eventually be "v2" in the record and "2026-11-15" on the page.
  it("is a plain ISO date", () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(TERMS_VERSION))).toBe(false);
  });

  // Compared as calendar days, not instants: Date.parse reads an ISO
  // date-only string as UTC midnight and "15 November 2026" as local
  // midnight, so the timestamps differ everywhere east or west of Greenwich.
  it("and the human-readable effective date describe the same day", () => {
    const spelled = new Date(TERMS_EFFECTIVE);
    expect(Number.isNaN(spelled.getTime())).toBe(false);
    const asIso = [
      spelled.getFullYear(),
      String(spelled.getMonth() + 1).padStart(2, "0"),
      String(spelled.getDate()).padStart(2, "0"),
    ].join("-");
    expect(asIso).toBe(TERMS_VERSION);
  });
});

describe("TERMS", () => {
  it("has a unique anchor per clause, because they get linked to", () => {
    const ids = TERMS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it("numbers its headings in order with no gaps", () => {
    const numbers = TERMS.map((c) => {
      const n = /^(\d+)\./.exec(c.heading)?.[1];
      expect(n, `"${c.heading}" must start with its clause number`).toBeDefined();
      return Number(n);
    });
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });

  it("has body text in every clause", () => {
    for (const clause of TERMS) {
      expect(clause.body.length, clause.id).toBeGreaterThan(0);
      for (const p of clause.body) expect(p.trim().length, clause.id).toBeGreaterThan(20);
    }
  });

  /**
   * The load-bearing clause, and the one most likely to be "tidied away" by
   * someone making the document sound tougher.
   *
   * A blanket exclusion of all liability is void against a consumer in India,
   * and a void clause protects nobody — strike it and the limitation of
   * liability goes with it. This carve-out is what leaves the rest standing.
   */
  it("keeps the carve-out for rights that cannot lawfully be excluded", () => {
    const liability = TERMS.find((c) => c.id === "liability");
    expect(liability).toBeDefined();
    const text = liability!.body.join(" ");
    expect(text).toMatch(/cannot lawfully be excluded/i);
    expect(text).toMatch(/Consumer Protection Act 2019/);
  });

  it("says plainly that enforcement can fail", () => {
    const text = TERMS.map((c) => [c.heading, ...c.body].join(" ")).join(" ");
    expect(text).toMatch(/best effort/i);
    expect(text).toMatch(/not guarantee/i);
  });
});

describe("the summaries shown before someone agrees", () => {
  it("are present and short enough to actually be read", () => {
    expect(TERMS_HIGHLIGHTS.length).toBeGreaterThanOrEqual(3);
    expect(TERMS_HIGHLIGHTS.length).toBeLessThanOrEqual(7);
    expect(PAYMENT_DISCLAIMER.length).toBeGreaterThanOrEqual(3);
    expect(PAYMENT_DISCLAIMER.length).toBeLessThanOrEqual(7);
  });

  // The payment disclaimer is read at the moment money has already moved, so
  // the two facts a payer most needs are that access is not instant and that
  // the money is not coming back.
  it("tell a payer the two things that cost them if unsaid", () => {
    const text = PAYMENT_DISCLAIMER.join(" ");
    expect(text).toMatch(/non-refundable/i);
    expect(text).toMatch(/confirms this payment by hand/i);
  });
});

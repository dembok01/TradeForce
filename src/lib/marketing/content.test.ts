import { describe, expect, it } from "vitest";
import { COMPARISON, FAQS, POSTS, STAT_STRIP, STEPS, TESTIMONIALS } from "./content";

// Guards the spec's anti-goal: no fabricated proof on a live commercial
// product. The reference template fills these sections with invented customers
// and placeholder posts; we build the sections and ship the data empty, and the
// components render nothing when empty. If someone later drops filler in to
// "fill the gap", this fails.
const UNPROVEN: Array<[string, readonly unknown[]]> = [
  ["TESTIMONIALS", TESTIMONIALS],
  ["POSTS", POSTS],
  ["STAT_STRIP", STAT_STRIP],
];

describe("unproven content ships empty", () => {
  it.each(UNPROVEN)("%s is empty until real content exists", (_name, items) => {
    expect(items).toHaveLength(0);
  });
});

// FUNDED-ACCOUNTS.md §3.2/§6: "Does the firm allow EAs?" is necessary but not
// sufficient — third-party access, VPS/hosting and shared-IP clauses each bite
// separately, and must be checked per firm. IMPLEMENTATION_GUIDE.md:101: there
// is no Stripe, so there is no billing term to promise either. Any blanket
// compatibility, support-time or refund claim in an FAQ answer would be false.
const UNSUPPORTED_CLAIMS: Array<[string, RegExp]> = [
  ["blanket firm/broker compatibility", /\bany (funded|prop|broker|firm)/i],
  ["blanket account compatibility", /\ball (funded|prop) (accounts?|firms?)/i],
  ["works-with-everything", /works with (every|any|all)\b/i],
  ["round-the-clock support", /24\s*\/?\s*7/i],
  ["instant refunds", /instant(ly)? refund/i],
  ["money-back guarantee", /money[-\s]back guarantee/i],
  ["guaranteed outcomes", /\bguarantee(d|s)? (you|your|that|a )/i],
  ["named response time", /\bwithin \d+\s*(hour|hr|minute|min|business day)/i],
];

describe("FAQ copy", () => {
  it("has six complete entries", () => {
    expect(FAQS).toHaveLength(6);
    for (const faq of FAQS) {
      expect(faq.question.trim()).not.toBe("");
      expect(faq.answer.trim()).not.toBe("");
    }
  });

  it("numbers the entries 01 through 06 in order", () => {
    expect(FAQS.map((f) => f.n)).toEqual(["01", "02", "03", "04", "05", "06"]);
  });

  it.each(UNSUPPORTED_CLAIMS)("makes no %s claim", (_label, pattern) => {
    const offenders = FAQS.filter((f) => pattern.test(f.answer)).map((f) => f.question);
    expect(offenders).toEqual([]);
  });
});

describe("steps and comparison", () => {
  it("has three steps, numbered in order", () => {
    expect(STEPS).toHaveLength(3);
    expect(STEPS.map((s) => s.n)).toEqual(["01", "02", "03"]);
  });

  it("has five comparison rows, both sides filled", () => {
    expect(COMPARISON).toHaveLength(5);
    for (const row of COMPARISON) {
      expect(row.them.trim()).not.toBe("");
      expect(row.us.trim()).not.toBe("");
    }
  });
});

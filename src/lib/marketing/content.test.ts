import { describe, expect, it } from "vitest";
import {
  COMPARISON,
  FAQS,
  MOBILE_ROUTES,
  POSTS,
  STAT_STRIP,
  STEPS,
  TESTIMONIALS,
} from "./content";

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

// The mobile spotlight makes the page's boldest claim, so its copy is the copy
// most able to overstate. Three repo facts bound it, and each gets a guard:
//
//  1. `ea/TradeForce.mq5` Push(): `if (CloudMode) return;` — a hosted terminal
//     has no MetaQuotes ID and the trader has no way to set one, so the cloud
//     route can never send a phone alert. Only the EA on the trader's own
//     MetaTrader does.
//  2. FUNDED-ACCOUNTS.md §5.2: the trader's own terminal protects them "only
//     while their PC is on and MetaTrader is open". Computer-off protection is
//     the hosted route's property and must not be borrowed by the other.
//  3. FUNDED-ACCOUNTS.md §7.1: MQL5 gives an EA no pre-broker veto on a manual
//     order — settled, and not to be re-litigated in marketing copy. Neither
//     route prevents a trade; both correct one.
describe("mobile route copy", () => {
  it("describes exactly the two routes the product has", () => {
    expect(MOBILE_ROUTES.map((r) => r.id)).toEqual(["cloud", "own"]);
    for (const route of MOBILE_ROUTES) {
      expect(route.title.trim()).not.toBe("");
      expect(route.badge.trim()).not.toBe("");
      expect(route.body.trim()).not.toBe("");
    }
  });

  it("promises no phone alert on the hosted route", () => {
    const cloud = MOBILE_ROUTES.find((r) => r.id === "cloud");
    expect(`${cloud?.title} ${cloud?.badge} ${cloud?.body}`).not.toMatch(
      /push|notif|alert/i
    );
  });

  it("promises no computer-off protection on the trader's own terminal", () => {
    const own = MOBILE_ROUTES.find((r) => r.id === "own");
    expect(`${own?.title} ${own?.badge} ${own?.body}`).not.toMatch(
      /computer (is )?(off|shut|closed)|switched off|laptop (shut|closed)|while you sleep|24\s*\/?\s*7/i
    );
  });

  it("claims correction, never prevention, of an order already placed", () => {
    for (const route of MOBILE_ROUTES) {
      expect(route.body).not.toMatch(/\b(prevents?|vetoe?s?|refuses?)\b|before it reaches/i);
    }
  });

  it.each(UNSUPPORTED_CLAIMS)("makes no %s claim", (_label, pattern) => {
    const offenders = MOBILE_ROUTES.filter((r) => pattern.test(r.body)).map((r) => r.id);
    expect(offenders).toEqual([]);
  });
});

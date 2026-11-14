import { describe, expect, it } from "vitest";
import {
  COMPARISON,
  FAQS,
  MOBILE_ROUTES,
  POSTS,
  RUNS_ON,
  RUNS_ON_DISCLAIMER,
  RUNS_ON_LEAD,
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

// Naming a prop firm on a landing page is the page's highest-risk copy: it is
// the one place a reader could reasonably infer a commercial relationship that
// does not exist. FUNDED-ACCOUNTS.md §6 lists the three clauses that decide
// whether a funded account can use this at all - third-party access, VPS and
// hosting, accounts per IP - and says they must be answered "before the service
// is marketed for funded accounts". None has a written ruling yet. So the strip
// may state what the EA runs on and who issues MetaTrader 5 accounts, and must
// not imply endorsement.
describe("runs-on strip", () => {
  const ENDORSEMENT = /partner|endorsed by|approved by|certified by|official|authoris|authoriz|verified|accredited|trusted by/i;

  it("names one platform, and it is the one the EA is written for", () => {
    const platforms = RUNS_ON.filter((m) => m.kind === "platform");
    expect(platforms.map((m) => m.name)).toEqual(["MetaTrader 5"]);
  });

  it("names at least one firm, each with a real name", () => {
    const firms = RUNS_ON.filter((m) => m.kind === "firm");
    expect(firms.length).toBeGreaterThan(0);
    for (const firm of firms) expect(firm.name.trim()).not.toBe("");
  });

  it("claims no endorsement in the headline copy or the marks", () => {
    // The disclaimer is exempt: it is the one place these words belong, as a
    // denial. Everything a reader skims must be clean of them.
    const skimmed = [RUNS_ON_LEAD, ...RUNS_ON.map((m) => m.name)].join(" ");
    expect(skimmed).not.toMatch(ENDORSEMENT);
  });

  it("says plainly that there is no affiliation and no endorsement", () => {
    expect(RUNS_ON_DISCLAIMER).toMatch(/not affiliated/i);
    expect(RUNS_ON_DISCLAIMER).toMatch(/not endorsed/i);
  });

  it("sends the reader to their own firm's rules", () => {
    expect(RUNS_ON_DISCLAIMER).toMatch(/read yours|your (own )?firm|check yours/i);
    expect(RUNS_ON_DISCLAIMER).toMatch(/in writing/i);
  });

  it.each(UNSUPPORTED_CLAIMS)("makes no %s claim", (_label, pattern) => {
    for (const copy of [RUNS_ON_LEAD, RUNS_ON_DISCLAIMER]) {
      expect(copy).not.toMatch(pattern);
    }
  });
});

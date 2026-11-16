/**
 * Landing-page copy, in one place.
 *
 * Two rules govern everything in this file, both from the design spec's
 * anti-goals:
 *
 *  1. Nothing asserts a capability the code does not have.
 *  2. Nothing asserts a commercial term — price, support time, refund policy,
 *     prop-firm compatibility — that no repo document supports.
 *
 * `content.test.ts` enforces both mechanically. TESTIMONIALS, POSTS and
 * STAT_STRIP ship empty on purpose: the reference template fills those sections
 * with invented customers and placeholder posts, and their components render
 * nothing while the array is empty. Drop real content in and they appear.
 */

export type Testimonial = { quote: string; name: string; role: string };
export type Post = { slug: string; category: string; title: string; excerpt: string };
export type Stat = { value: string; label: string };
export type Step = { n: string; title: string };
export type Faq = { n: string; question: string; answer: string };
export type ComparisonRow = { them: string; us: string };
export type MobileRoute = { id: "cloud" | "own"; title: string; badge: string; body: string };
export type RunsOnMark = { name: string; kind: "platform" | "firm" };

/** Needs real quotes with real attribution. See the spec's "Open" section. */
export const TESTIMONIALS: Testimonial[] = [];

/** Needs a blog. There is no CMS and no posts. */
export const POSTS: Post[] = [];

/** Needs real figures — accounts protected, violations blocked. */
export const STAT_STRIP: Stat[] = [];

/**
 * Where the terminal lives, which is the whole difference between the two
 * routes and the reason the mobile claim is true at all.
 *
 * The split is enforced in code, not merely described here: `enableCloudEaAction`
 * refuses a hosted terminal for an address catalogued as a funded-account
 * provider (FUNDED-ACCOUNTS.md §5.1 — every firm checked requires the named
 * account holder to place the trades, and hosting means we hold the password).
 *
 * The asymmetry in this copy is deliberate and guarded by tests. Only the
 * hosted route survives a closed laptop; only the trader's own terminal can
 * send a phone alert, because `Push()` in the EA returns early under
 * `CloudMode` — a pool terminal has no MetaQuotes ID to send to.
 */
export const MOBILE_ROUTES: MobileRoute[] = [
  {
    id: "cloud",
    title: "Broker account",
    badge: "Nothing to install",
    body: "We run MT5 for you in our cloud. Trade from your phone with your laptop shut, and your rules still hold.",
  },
  {
    id: "own",
    title: "Funded or evaluation account",
    badge: "You run the EA",
    body: "Firms want the account holder placing trades, so the EA runs on your own MT5. Breaches reach your phone as MT5 push alerts while it runs.",
  },
];

export const STEPS: Step[] = [
  { n: "01", title: "Connect MT5" },
  { n: "02", title: "Set your rules" },
  { n: "03", title: "Trade. It enforces." },
];

export const COMPARISON: ComparisonRow[] = [
  { them: "A journal, after the damage", us: "Enforced at the order" },
  { them: "Willpower after three losses", us: "Rules that never renegotiate" },
  { them: "Spreadsheets that miss trades", us: "Every trade reported by the EA" },
  { them: "Limits moved mid session", us: "Every order checked against your charter" },
  { them: "Surprises at the payout review", us: "Every breach logged with its numbers" },
];

export const FAQS: Faq[] = [
  {
    n: "01",
    question: "What does TradeForce actually do?",
    answer:
      "It enforces your trading rules inside MetaTrader 5: daily loss, trades per day, open positions, risk per trade and session hours. You set them in the dashboard. The EA makes them bind.",
  },
  {
    n: "02",
    question: "What do I need to run it?",
    answer:
      "An MT5 account. On a broker account we can host the terminal for you, with nothing to install. On a funded account you attach the EA to your own MT5 with an API key, and it protects you while that terminal is open.",
  },
  {
    n: "03",
    question: "Can I use this on an evaluation or funded account?",
    answer:
      "That depends on your firm. Allowing EAs is not enough: check its rules on third party access, hosting and shared IP addresses. Running the EA on your own MT5 shares no login and uses no outside host, but read your own contract.",
  },
  {
    n: "04",
    question: "How quickly does a rule change reach the terminal?",
    answer:
      "The EA checks for changes about every 60 seconds. No restart, no reattaching.",
  },
  {
    n: "05",
    question: "What happens when I break a rule?",
    answer:
      "The EA acts, it does not warn. A trade over your cap is closed as it fills. A daily loss breach flattens the account and closes the terminal. Every breach is logged with the trade and the numbers behind it.",
  },
  {
    n: "06",
    question: "What does it cost?",
    answer:
      "$13 a month, paid in rupees by UPI: ₹1,249 for one month, ₹3,399 for three, ₹11,999 for a year. Scan the QR, pay from any UPI app, and a person confirms it, usually the same day. Prepaid, no auto renewal, not refundable.",
  },
];

/**
 * What the EA actually runs on, and which firms issue accounts it attaches to.
 *
 * Deliberately a platform claim, not a partnership claim. No firm has given
 * TradeForce a written ruling (see the open items in FUNDED-ACCOUNTS.md §6),
 * and three of the clauses that decide the matter - third-party access, VPS
 * and hosting, multiple accounts per IP - are per-firm contract questions that
 * §6 says must be answered "before the service is marketed for funded
 * accounts". So this names the firms as issuers of MetaTrader 5 accounts, which
 * is a fact about them, and says nothing about their endorsement, which is not.
 *
 * What makes it true is §5.2: the trader attaches the EA to their own
 * MetaTrader, which is "almost always within the firm's rules if EAs are
 * allowed" because it involves no credential sharing, no third-party hosting
 * and no shared IP.
 *
 * Rendered as wordmarks in our own typeface rather than the firms' logo files:
 * a logo carries an implication of endorsement that a name in running text
 * does not, and we hold no licence to redistribute their marks.
 *
 * Three firms only, on the client's instruction: the full list
 * (src/lib/funded-firms.ts) is shown to paying traders in the dashboard. Each firm's own
 * rulebook is the authority, and several have a clause worth knowing: FTMO caps
 * allocated capital per strategy across traders, The 5%ers asks that the trader
 * own the EA's source, E8 Markets warns that many users on one EA may be
 * terminated. None of that is settled in our favour, which is exactly why the
 * disclaimer below sends people to their own firm.
 */
export const RUNS_ON: RunsOnMark[] = [
  { name: "MetaTrader 5", kind: "platform" },
  { name: "FTMO", kind: "firm" },
  { name: "Funding Pips", kind: "firm" },
  { name: "The 5%ers", kind: "firm" },
];

export const RUNS_ON_LEAD =
  "Attach the EA to the MT5 account your firm gave you. Your rules hold on the account itself.";

export const RUNS_ON_DISCLAIMER =
  "Named only as issuers of MT5 accounts. TradeForce is not affiliated with these firms and is not endorsed or certified by them. Each sets its own rules on EAs, third party access and VPS use: read your own firm's rules before you attach anything, and keep the answer in writing.";

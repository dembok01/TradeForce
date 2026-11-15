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
export type Step = { n: string; title: string; body: string };
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
    body: "Hand the dashboard your MetaTrader 5 login and we start a terminal for that account in our own cloud. Your charter is enforced on the account itself, so it holds while you place orders from the MetaTrader app on your phone — and it keeps holding with your own machine shut down. Every breach lands in your dashboard with the trade that caused it.",
  },
  {
    id: "own",
    title: "Funded or evaluation account",
    badge: "You run the EA",
    body: "Every firm we have checked requires the named account holder to place the trades, so a hosted terminal is off the table. You download the EA from your dashboard and attach it to your own MetaTrader 5 instead — same charter, same rules — and a breach arrives as a MetaTrader push notification on the phone you already trade on. It holds the line while that terminal is running.",
  },
];

export const STEPS: Step[] = [
  {
    n: "01",
    title: "Connect your account",
    body: "Hand the dashboard your MetaTrader 5 login and we run the terminal for you, or install the Expert Advisor in your own MetaTrader and authorise it with an API key. Either way it reports trades, violations and equity back as it runs.",
  },
  {
    n: "02",
    title: "Write your charter",
    body: "Set the daily loss limit, the maximum trades per day, the open position cap, the risk per trade, and the session window you are allowed to trade in.",
  },
  {
    n: "03",
    title: "Let it hold the line",
    body: "The EA checks its configuration on a 60-second target and acts in the terminal the moment a rule would be broken — not in a journal you fill in afterwards.",
  },
];

export const COMPARISON: ComparisonRow[] = [
  {
    them: "A journal you fill in after the damage is done",
    us: "Enforcement in the terminal, at the moment of the order",
  },
  {
    them: "Willpower, on the day it matters least",
    us: "A rule set that does not renegotiate after three losses",
  },
  {
    them: "A spreadsheet that never sees the trade",
    us: "Every trade, violation and equity change reported by the EA itself",
  },
  {
    them: "Limits you can quietly move mid-session",
    us: "A charter version the terminal checks each order against",
  },
  {
    them: "Finding out at the payout review",
    us: "A violation logged with the numbers that triggered it",
  },
];

export const FAQS: Faq[] = [
  {
    n: "01",
    question: "What does TradeForce actually do?",
    answer:
      "It holds the trading rules you set — daily loss limit, maximum trades per day, open position cap, risk per trade, and a session window — and enforces them inside MetaTrader 5 rather than reporting on them after the fact. The dashboard is where you write the rules; the Expert Advisor is what makes them bind.",
  },
  {
    n: "02",
    question: "What do I need to run it?",
    answer:
      "A MetaTrader 5 account, and a decision about where the terminal lives. On a broker account you can hand us the login and we run the terminal in our own cloud — nothing to install, nothing to leave switched on, and your rules hold whichever device you trade from. On a funded or evaluation account the terminal has to be your own: you install the Expert Advisor in your MetaTrader 5, authorise it with an API key from the dashboard, and it protects you while that terminal is open.",
  },
  {
    n: "03",
    question: "Can I use this on an evaluation or funded account?",
    answer:
      "That depends on your firm's agreement, and it is worth reading closely before you rely on it. Permission to run Expert Advisors is necessary but not sufficient: separate clauses usually govern third-party access to the account, where the terminal may be hosted, and how multiple accounts sharing one address are treated. Running the EA yourself, in your own MetaTrader, involves no shared credentials and no third-party hosting — but check your own contract.",
  },
  {
    n: "04",
    question: "How quickly does a rule change reach the terminal?",
    answer:
      "The EA polls its configuration on a 60-second target, so a change you make in the dashboard takes effect on the next poll. You do not need to restart the terminal or reattach the EA.",
  },
  {
    n: "05",
    question: "What happens when I break a rule?",
    answer:
      "The EA acts in the terminal rather than warning you. A trade over your daily cap is closed as soon as it fills; a daily-loss breach flattens the account and closes the terminal itself. Either way the breach is logged to the Violation Centre with the trade that caused it, the numbers that triggered it, and a timestamp.",
  },
  {
    n: "06",
    question: "What does it cost?",
    answer:
      "One plan at $13 a month, charged in rupees by UPI: ₹1,249 for a month, ₹3,399 for three, or ₹11,999 for a year — the longer periods work out at ₹1,133 and ₹1,000 a month. You get a QR with the amount and a reference already in it, you pay from Google Pay or any UPI app, and we match it against the account before your access starts. Card payments are not connected yet, so every payment is confirmed by a person — usually the same day. Periods are prepaid, do not auto-renew, and are non-refundable.",
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
 * Checked 15 Nov 2026 - each firm's own rulebook is the authority and each has
 * a clause worth knowing: Funding Pips permits a third-party EA only as a trade
 * or risk-management tool (which is what this is), FTMO caps allocated capital
 * per strategy across traders, and The 5%ers asks that the trader own the EA's
 * source. None of that is settled in our favour, which is exactly why the
 * disclaimer below sends people to their own firm.
 */
export const RUNS_ON: RunsOnMark[] = [
  { name: "MetaTrader 5", kind: "platform" },
  { name: "FTMO", kind: "firm" },
  { name: "Funding Pips", kind: "firm" },
  { name: "The 5%ers", kind: "firm" },
];

export const RUNS_ON_LEAD =
  "TradeForce is an Expert Advisor. You attach it to the MetaTrader 5 terminal your broker or prop firm already gave you, and your charter is enforced on the account itself.";

export const RUNS_ON_DISCLAIMER =
  "These firms are named because they issue MetaTrader 5 accounts the EA attaches to. TradeForce is not affiliated with them and is not endorsed or certified by them. Each one sets its own rules on Expert Advisors, third-party access and VPS use \u2014 read yours before you attach anything, and keep the answer in writing.";

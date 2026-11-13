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

/** Needs real quotes with real attribution. See the spec's "Open" section. */
export const TESTIMONIALS: Testimonial[] = [];

/** Needs a blog. There is no CMS and no posts. */
export const POSTS: Post[] = [];

/** Needs real figures — accounts protected, violations blocked. */
export const STAT_STRIP: Stat[] = [];

export const STEPS: Step[] = [
  {
    n: "01",
    title: "Connect your terminal",
    body: "Install the TradeForce Expert Advisor in MetaTrader 5 and authorise it with an API key from your dashboard. It reports trades, violations and equity back as it runs.",
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
      "MetaTrader 5, on a machine you control. You install the TradeForce Expert Advisor in your own terminal and authorise it with an API key issued from the dashboard. Because it runs in your terminal, it protects you while that terminal is open — not from a phone or a second machine.",
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
      "There is a free tier covering one account with the full rule set, and a paid tier at $29 a month for evaluation and funded accounts where a breach costs a payout. Card payments are not connected yet, so both buttons take you to sign-up and nothing is charged today.",
  },
];

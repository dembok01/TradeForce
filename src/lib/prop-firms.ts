// Prop firms commonly forbid what hosted protection is: an Expert Advisor, a
// shared server (VPS) and a third party holding the trading password.
// FundedNext, for one, bans EAs on accounts of $50k+, EAs on free trials, shared
// VPS connections and third-party account access (checked 21 Sep 2026). So the
// Connect form asks the trader to check their firm's rules before connecting.
//
// A heuristic on purpose: it only decides whether a warning is shown, so a
// false positive costs one tick-box. Word-bounded so "Equiti" or "Fusion" never
// match.
const PROP_FIRM_RE = new RegExp(
  [
    "funded ?next",
    "ftmo",
    "the ?5 ?ers",
    "fxify",
    "e8( markets| funding)?",
    "maven( trading)?",
    "alpha ?capital",
    "funded ?trading ?plus",
    "funding ?pips",
    "blue ?guardian",
    "goat ?funded",
    "instant ?funding",
    "fintokei",
    "topstep",
    "apex ?trader",
    "city ?traders ?imperium",
    "lark ?funding",
    "funded ?engineer",
    "for ?traders",
    "prop ?firm",
    "funded ?account",
    "challenge",
  ]
    .map((p) => `\\b${p}\\b`)
    .join("|"),
  "i"
);

export function looksLikePropFirm(...texts: (string | null | undefined)[]): boolean {
  return texts.some((t) => Boolean(t && PROP_FIRM_RE.test(t.replace(/[-_.]/g, " "))));
}

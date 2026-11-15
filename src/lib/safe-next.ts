/**
 * Sanitise a post-auth redirect target.
 *
 * `?next=` reaches redirect() from a query string, and Next's redirect()
 * happily sends a browser to an absolute URL — so an unchecked `next` is an
 * open redirect, and an open redirect on a login page is a phishing kit: the
 * link looks like ours, the password prompt is ours, and the landing page is
 * theirs.
 *
 * Two earlier versions of this function were wrong in the same way: each
 * inspected one representation of the value and then handed out a different
 * one. Both bypasses are worth keeping written down, because they are the
 * reason the function is now shaped the way it is.
 *
 *   1. **Checking the input string by eye.** The WHATWG URL parser deletes
 *      ASCII tab, LF and CR *before* parsing, so `/<tab>/evil.test` is not the
 *      local path it looks like: the tab vanishes and `//evil.test` is left,
 *      which is protocol-relative and leaves the site. A tab is a legal HTTP
 *      field-value character, so Node puts it in the Location header without
 *      complaint and the browser follows it.
 *
 *   2. **Checking the input, then returning the normalised path.** Resolving
 *      `/.//evil.test` against a base keeps it on that base, so an origin
 *      check on the *parsed URL* passes — while its pathname has normalised to
 *      `//evil.test`, which is protocol-relative the moment it is handed back
 *      on its own. Same for `/a/..//evil.test`.
 *
 * So the rule now is: **validate the value that is actually returned, and
 * require it to be a fixed point.** The candidate is resolved, then resolved
 * again; it is only returned if the second pass leaves it identical and still
 * on an origin we control. A value that survives that has no second reading
 * left for a browser to find — which is what closes the class rather than the
 * two instances of it.
 *
 * Characters that change how a parser reads a string are still refused up
 * front, because they should never appear in a path we generated.
 */

// Any origin that cannot exist. `.invalid` is reserved by RFC 2606 precisely
// so it can never resolve, and nothing is ever fetched from it regardless —
// it exists only to give the parser something to resolve against.
const NOWHERE = "https://safe-next.invalid";

// C0 controls (tab, LF and CR among them), DEL, and the backslash some
// browsers normalise to a forward slash.
const PARSER_CONFUSING = /[\u0000-\u001F\u007F\\]/;

/**
 * Resolve a reference against NOWHERE and give back its path, or null if it
 * landed anywhere other than NOWHERE. A protocol-relative or absolute
 * reference lands elsewhere and so comes back null.
 */
function onOurOrigin(reference: string): string | null {
  try {
    const url = new URL(reference, NOWHERE);
    if (url.origin !== NOWHERE) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function safeNext(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string") return fallback;

  const raw = value.trim();
  if (!raw.startsWith("/")) return fallback;
  if (PARSER_CONFUSING.test(raw)) return fallback;

  const candidate = onOurOrigin(raw);
  if (candidate === null) return fallback;

  // The fixed-point check. `/.//evil.test` reaches here as `//evil.test`,
  // which on its own is protocol-relative — so this second pass sends it to
  // another origin and returns null, and it is refused.
  if (onOurOrigin(candidate) !== candidate) return fallback;

  return candidate;
}

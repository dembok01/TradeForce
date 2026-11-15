/**
 * Where this deployment lives, without a trailing slash.
 *
 * The single source for three things that must agree: auth redirect targets,
 * the links in the emails we send, and the host traders are told to allowlist
 * in MetaTrader. An approval email whose "sign in" button points at localhost
 * is worse than no email; a WebRequest allowlist entry for the wrong host is
 * worse again, because MT5 blocks it silently and enforcement just stops.
 *
 * Set NEXT_PUBLIC_SITE_URL to the CANONICAL host — the one that answers 200
 * rather than redirecting. tradeforce.in 308s to www.tradeforce.in, and MQL5's
 * WebRequest reports a 308 instead of following it, so the apex would break
 * every EA call. Use https://www.tradeforce.in unless that redirect is flipped.
 *
 * The localhost fallback is for development, and is deliberately a host that
 * fails loudly in production rather than a stale preview domain that fails
 * plausibly.
 */
export function getSiteUrl(): string {
  const url = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").trim();
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

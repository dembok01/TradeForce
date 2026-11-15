/**
 * Who sends our email, and with what key.
 *
 * Returns null rather than throwing when it is not configured, so a deployment
 * without a Resend key still takes payments — it just does not announce them.
 * Every caller treats a null mailer as "skip, log it", never as an error: an
 * email provider being down must not stop a trader telling us they have paid,
 * and must not stop an operator granting the plan they paid for.
 *
 * EMAIL_FROM must be an address on a domain verified in Resend (tradeforce.in),
 * either bare (billing@tradeforce.in) or with a display name
 * (TradeForce <billing@tradeforce.in>). Resend refuses anything else, and it
 * refuses it at send time, which is the worst moment to find out.
 */
export type Mailer = {
  apiKey: string;
  from: string;
  /** Where replies land, when that differs from the sender. */
  replyTo: string | null;
};

type Env = Record<string, string | undefined>;

const clean = (v: string | undefined) => (v ?? "").trim();

// Deliberately loose: one @, no spaces either side, something before and after.
// Tight email regexes reject valid addresses, and the real validation is
// Resend's own domain check.
const ADDRESS = /^[^\s@<>]+@[^\s@<>.]+(\.[^\s@<>.]+)+$/;

/** Pulls the bare address out of "Name <a@b.c>", or returns the input. */
export function addressOf(from: string): string {
  const angled = from.match(/<([^>]+)>\s*$/);
  return (angled ? angled[1] : from).trim();
}

export function parseMailer(env: Env): Mailer | null {
  const apiKey = clean(env.RESEND_API_KEY);
  const from = clean(env.EMAIL_FROM);
  if (!apiKey || !from) return null;
  if (!ADDRESS.test(addressOf(from))) return null;

  const replyTo = clean(env.EMAIL_REPLY_TO);
  return {
    apiKey,
    from,
    replyTo: replyTo && ADDRESS.test(addressOf(replyTo)) ? replyTo : null,
  };
}

export function mailer(): Mailer | null {
  // Referenced by literal name, like the rest of this codebase's env reads:
  // never build an env key by computation.
  return parseMailer({
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
  });
}

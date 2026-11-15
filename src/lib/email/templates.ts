import { formatInr } from "@/lib/billing/plans";

/**
 * The three emails the payment flow sends.
 *
 * Plain HTML with inline styles and a plain-text twin, because email clients
 * are hostile to anything else and a trader checking GPay on a phone is the
 * likeliest reader. No images: they are blocked by default, and an email about
 * money that renders as empty boxes reads like a phishing attempt.
 *
 * Every interpolated value is escaped. The rejection reason is typed by an
 * operator and the name comes from a signup form, so neither is ours.
 */

export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type Email = { subject: string; html: string; text: string };

const BRAND = "#b8860b";
const INK = "#1a1a1a";
const MUTED = "#666";

function layout(body: string, siteUrl: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;">
<div style="font-size:18px;font-weight:600;letter-spacing:-0.02em;margin-bottom:24px;">Trade<span style="color:${BRAND};">Force</span></div>
${body}
<hr style="border:none;border-top:1px solid #e5e5e5;margin:28px 0 16px;">
<p style="font-size:12px;color:${MUTED};margin:0;line-height:1.5;">
You're receiving this because someone signed up for TradeForce with this address.
<a href="${esc(siteUrl)}" style="color:${MUTED};">${esc(siteUrl.replace(/^https?:\/\//, ""))}</a>
</p>
</div></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0;"><a href="${esc(href)}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;font-size:15px;">${esc(label)}</a></p>`;
}

const p = (html: string) =>
  `<p style="font-size:15px;line-height:1.6;margin:0 0 14px;">${html}</p>`;

function greeting(name: string | null): string {
  return name ? `Hi ${esc(name.split(" ")[0])},` : "Hi,";
}

/** Sent the moment a trader submits their transaction ID. */
export function paymentClaimedEmail(args: {
  name: string | null;
  reference: string;
  amountInr: number;
  months: number;
  siteUrl: string;
}): Email {
  const { reference, amountInr, months, siteUrl } = args;
  const period = `${months} month${months === 1 ? "" : "s"}`;
  const amount = formatInr(amountInr);

  const html = layout(
    `${p(greeting(args.name))}
${p(`We've got your payment details and someone is checking them against our account now.`)}
<div style="background:#faf9f7;border-radius:8px;padding:16px;margin:0 0 16px;font-size:14px;line-height:1.7;">
<strong>Reference</strong> <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${esc(reference)}</span><br>
<strong>Amount</strong> ${esc(amount)}<br>
<strong>Period</strong> ${esc(period)}
</div>
${p(`This is checked by hand, usually the same day. We'll email you the moment it's confirmed and your plan will start then — not before, so you lose none of it waiting.`)}
${p(`<span style="color:${MUTED};">You don't need to do anything else. If you paid a different amount or used a different transaction ID, just reply to this email.</span>`)}`,
    siteUrl
  );

  const text = `${args.name ? `Hi ${args.name.split(" ")[0]},` : "Hi,"}

We've got your payment details and someone is checking them against our account now.

  Reference: ${reference}
  Amount:    ${amount}
  Period:    ${period}

This is checked by hand, usually the same day. We'll email you the moment it's
confirmed and your plan will start then - not before, so you lose none of it
waiting.

You don't need to do anything else. If you paid a different amount or used a
different transaction ID, just reply to this email.

${siteUrl}`;

  return { subject: `We're checking your payment (${reference})`, html, text };
}

/** Sent when an operator approves the claim. This is the one that grants access. */
export function paymentApprovedEmail(args: {
  name: string | null;
  reference: string;
  amountInr: number;
  months: number;
  expiresAt: Date;
  siteUrl: string;
}): Email {
  const { reference, amountInr, months, expiresAt, siteUrl } = args;
  const period = `${months} month${months === 1 ? "" : "s"}`;
  const until = expiresAt.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  const html = layout(
    `${p(greeting(args.name))}
${p(`<strong>Your payment is confirmed and your account is open.</strong>`)}
<div style="background:#faf9f7;border-radius:8px;padding:16px;margin:0 0 16px;font-size:14px;line-height:1.7;">
<strong>Plan</strong> ${esc(period)}, running until ${esc(until)}<br>
<strong>Paid</strong> ${esc(formatInr(amountInr))}<br>
<strong>Reference</strong> <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${esc(reference)}</span>
</div>
${button(`${siteUrl}/dashboard`, "Open your dashboard")}
${p(`Sign in at <a href="${esc(siteUrl)}/login" style="color:${BRAND};">${esc(siteUrl.replace(/^https?:\/\//, ""))}/login</a> with the email address this was sent to.`)}
${p(`Next step: connect your trading account and set your rules. The EA won't enforce anything until you've told it what your limits are.`)}
${p(`<span style="color:${MUTED};">We'll remind you before ${esc(until)}. Paying early adds to the time you have rather than replacing it.</span>`)}`,
    siteUrl
  );

  const text = `${args.name ? `Hi ${args.name.split(" ")[0]},` : "Hi,"}

Your payment is confirmed and your account is open.

  Plan:      ${period}, running until ${until}
  Paid:      ${formatInr(amountInr)}
  Reference: ${reference}

Open your dashboard: ${siteUrl}/dashboard
Sign in at ${siteUrl}/login with the email address this was sent to.

Next step: connect your trading account and set your rules. The EA won't
enforce anything until you've told it what your limits are.

We'll remind you before ${until}. Paying early adds to the time you have
rather than replacing it.

${siteUrl}`;

  return { subject: `You're in — TradeForce is active until ${until}`, html, text };
}

/** Sent when an operator cannot match the claim. The reason is theirs, verbatim. */
export function paymentRejectedEmail(args: {
  name: string | null;
  reference: string;
  reason: string;
  siteUrl: string;
}): Email {
  const { reference, reason, siteUrl } = args;

  const html = layout(
    `${p(greeting(args.name))}
${p(`We couldn't match your payment <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${esc(reference)}</span> against our account, so we haven't started your plan.`)}
<div style="background:#fdf6f6;border-left:3px solid #c0392b;border-radius:4px;padding:14px 16px;margin:0 0 16px;font-size:14px;line-height:1.6;">
${esc(reason)}
</div>
${p(`<strong>If you have paid</strong>, reply to this email with the transaction ID and a screenshot and we'll find it. Nothing has been taken from you by us — if money left your account, it is still with your bank or ours and we will trace it.`)}
${button(`${siteUrl}/dashboard/billing`, "Try again")}`,
    siteUrl
  );

  const text = `${args.name ? `Hi ${args.name.split(" ")[0]},` : "Hi,"}

We couldn't match your payment ${reference} against our account, so we haven't
started your plan.

  ${reason}

If you have paid, reply to this email with the transaction ID and a screenshot
and we'll find it. Nothing has been taken from you by us - if money left your
account, it is still with your bank or ours and we will trace it.

Try again: ${siteUrl}/dashboard/billing

${siteUrl}`;

  return { subject: `We couldn't match your payment (${reference})`, html, text };
}

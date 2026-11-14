# Paying for TradeForce by UPI, with no gateway

**Status:** approved 2026-11-14. Approach chosen by the client's operator in
conversation; prices and periods confirmed by them.

## Why

The client cannot take card payments. Razorpay, PayPal and Stripe applications
are all filed and pending, and there is no date. What they do have is a Google
Pay UPI handle and a bank account. Until a gateway clears, the product has no
way to be bought at all, so the first paying customers are the ones being lost.

The launch market is India only. That removes the hard half of the problem:
every payer will have a UPI app, so UPI is sufficient rather than partial.

## What exists today

Nothing. `profiles` has no plan column, there is no payments table, and the
"1 trading account" / "up to 5 trading accounts" split on the pricing page is
copy that nothing enforces. This work therefore splits in two: collecting the
money, and knowing who has paid. The second half did not exist and is the
larger part.

## Goals

- A trader can buy a paid period from inside the dashboard and get access.
- The operator can tell, in one screen, who claims to have paid and whether to
  believe them.
- When a gateway finally clears, switching to it changes one function, not the
  system.

## Non-goals

- Automatic confirmation. NPCI exposes no API to third-party sites, so there is
  no honest way to know a UPI payment landed without a PSP. Every design that
  claims otherwise either reads the merchant's bank mail or puts a third party
  back in the payment flow.
- Auto-renewal. UPI AutoPay needs a PSP. Periods are prepaid and expire.
- Refunds through the product. The operator refunds by UPI by hand.

## Anti-goals

- A payment the trader believes succeeded while the system disagrees. Every
  state the trader can reach is visible to them, with what happens next.
- Any claim on the pricing page that the software does not do. Money changing
  hands turns marketing puff into misrepresentation.
- Silently changing who may use an existing feature. Nobody loses access they
  have today as a side effect of this work.

## Approaches considered

1. **Verify, then grant** (chosen). Trader pays, submits the UPI transaction
   ID, operator confirms against GPay and approves. Smallest build, no
   dependency that can fail, access is not instant.
2. **Grant on claim, verify after.** Instant access, provisional, auto-suspends
   in 48h. Better UX, but it buys that with a revocation flow — the worst thing
   to be debugging in a first month of revenue.
3. **Auto-match from forwarded bank alert emails.** Near-automatic, but needs
   access to the client's bank mail and breaks silently whenever the bank
   changes its template. Right answer at a volume that does not exist yet, and
   a straight upgrade later because the payments table is identical.

Rejected outright: the "zero-fee UPI gateway" resellers. They are third parties
in the payment flow, which is the thing the client ruled out, and they
generally require linking a specific Paytm Business or bank account.

## How it works

**Pricing.** $13/month on the landing page, ₹1,249 charged. Three periods:

| Period | Charged | Per month |
| --- | --- | --- |
| 1 month | ₹1,249 | ₹1,249 |
| 3 months | ₹3,399 | ₹1,133 |
| 12 months | ₹11,999 | ₹1,000 |

The 3- and 12-month figures are the author's call, at roughly 10% and 20% off,
and are one constant to change. Longer periods are the only lever against the
manual-approval cost: a trader on 12 months is one approval a year.

**The flow.** Dashboard → Billing → pick a period. That creates a `payments`
row in `awaiting_payment` with a short unique reference (`TF-7K3QD2`), and the
page renders a UPI QR generated from that row — payee, exact amount and the
reference as the transaction note. On a phone the same URI is a tap-to-pay
button that opens GPay directly. Bank details sit underneath as a fallback.

The trader pays, returns, and submits the 12-digit UPI transaction ID with an
optional screenshot. The row moves to `claimed`.

The operator opens /admin/payments, sees the claim with the reference, amount,
transaction ID and screenshot, checks GPay, and approves or rejects with a
reason. Approval extends `profiles.plan_expires_at`.

**Extension, not replacement.** A period bought while one is still running
extends from the existing expiry, not from today. Paying early must never cost
the trader the days they already own.

**Expiry needs no job.** Entitlement is computed from `plan_expires_at` against
the clock, so a lapsed plan lapses on its own. There is nothing to schedule and
nothing to go wrong overnight.

## Decisions the builder does not get to make

- **Every write goes through the service client inside a server action.** RLS on
  `payments` grants `select` on own rows and nothing else. A trader who can
  update their own row can set `status = 'approved'`, and Postgres RLS has no
  clean per-column guard. The server action is the only writer, and it takes
  `user_id` from the session, never from the form.
- **Proof screenshots live in a private bucket**, uploaded server-side from the
  action and shown to the operator through a short-lived signed URL. No
  client-side storage policy, no public object URLs.
- **The payee handle and bank details come from the environment**, never the
  repo. If they are unset the Billing page says payment is not configured
  rather than rendering a QR with an empty payee — a QR that scans to nowhere
  is worse than no QR.
- **The UPI transaction ID is required; the screenshot is optional.** The ID is
  what the operator actually searches in GPay, and it is on the same receipt
  screen the screenshot would come from.

## What this deliberately does not change

No existing feature is placed behind the paywall. Entitlement is recorded,
shown to the trader and shown in ops, and `getEntitlement()` is ready for
whatever the client wants gated — but nothing changes behaviour today, because
quietly revoking a live feature from existing users is not a side effect anyone
should discover.

The obvious candidate is the hosted cloud terminal: it is the one thing that
costs real money per trader (~0.5 GB and a container each), and it already
splits cleanly from the funded-account route, which costs nothing to serve.
That is a commercial decision for the client, not the builder's.

The pricing card's feature list is corrected as part of this work. "Up to 5
trading accounts" is not a thing the software can do — `getOrCreatePrimaryAccount`
gives every user exactly one account and there is no UI to add a second.

## Open

- The client's UPI handle, payee name and bank details, to put in the
  environment. Nothing works until these are set.
- `ADMIN_EMAILS` is read by `src/lib/admin.ts` but is absent from
  `.env.example`, so a fresh deployment has no operator who can approve
  anything. Added to the example as part of this work; the real value is the
  client's.
- Whether a personal UPI handle is the right instrument for business revenue.
  Collection volume, GST and the merchant/P2P distinction are a question for
  the client's accountant, not for this document.

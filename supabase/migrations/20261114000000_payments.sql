-- Paying for TradeForce by UPI, with no payment gateway.
--
-- The client's Razorpay/PayPal/Stripe applications are all pending, so there is
-- no webhook and no way to be told a payment succeeded: NPCI exposes no API to
-- third-party sites. A trader therefore claims a payment and an operator
-- confirms it against GPay. These tables are the record of that conversation.
--
-- When a gateway does clear, this table stays exactly as it is. The webhook
-- writes an 'approved' row and calls the same grant path the console does.

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Goes in the UPI note, so it is what the operator sees next to the credit in
  -- GPay and what they search for here. Unique because it is the join between
  -- a rupee in a bank account and a row in this table.
  reference text not null unique,

  months int not null check (months > 0),
  amount_inr numeric(10, 2) not null check (amount_inr > 0),

  --   awaiting_payment -> QR shown, trader has not come back yet
  --   claimed          -> trader submitted a UPI transaction ID
  --   approved         -> operator matched it in GPay; access granted
  --   rejected         -> operator could not match it; reason in `note`
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment', 'claimed', 'approved', 'rejected')),

  -- The 12-digit UPI transaction ID off the trader's receipt. Not unique: a
  -- duplicate is a thing the operator needs to SEE (someone pasting the same
  -- ID twice), not something the database should hide behind a 23505.
  utr text,

  -- Object path in the private 'payment-proofs' bucket. Optional: the
  -- transaction ID is what the operator actually searches, the screenshot is
  -- corroboration.
  proof_path text,

  note text,
  claimed_at timestamptz,
  decided_at timestamptz,
  decided_by text,
  created_at timestamptz not null default now()
);

-- RLS grants SELECT on own rows and nothing else, on purpose. Every write goes
-- through the service role inside a server action, which takes user_id from the
-- session. A trader who could UPDATE their own row could set status to
-- 'approved', and Postgres has no clean per-column guard to stop them.
alter table public.payments enable row level security;

drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own" on public.payments
  for select using (auth.uid() = user_id);

create index if not exists payments_user_id_idx on public.payments (user_id);
create index if not exists payments_status_created_idx on public.payments (status, created_at desc);

-- One live payment per trader. Without this, a double-submitted form leaves two
-- open rows with two references and the operator matching a credit to a coin
-- flip. Settled rows are unconstrained, so the history stays complete.
create unique index if not exists payments_one_open_per_user_idx
  on public.payments (user_id)
  where status in ('awaiting_payment', 'claimed');

-- Entitlement lives on the profile and is derived from the clock, not from a
-- flag somebody has to flip: `plan_expires_at` in the past IS a lapsed plan.
-- Nothing has to run overnight, so nothing can fail overnight.
alter table public.profiles add column if not exists plan text;
alter table public.profiles add column if not exists plan_expires_at timestamptz;

comment on column public.profiles.plan is
  'null/free = free tier, paid = bought a period. Active only while plan_expires_at is in the future.';
comment on column public.profiles.plan_expires_at is
  'End of the paid period. Extended from the existing expiry when a trader renews early.';

-- Private: payment screenshots are a trader's bank app, and a public object URL
-- is a public object URL forever. The operator sees them through a short-lived
-- signed URL minted server-side; no storage policy is needed because only the
-- service role ever touches the bucket.
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

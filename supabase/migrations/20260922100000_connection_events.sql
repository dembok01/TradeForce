-- Connection log: every step of connecting a trader's MT5 account, so "why is
-- it not connecting?" is answered from the dashboard instead of an SSH session
-- into the pool server. One row per step; append-only.
--
-- Written with the service role by the website (submitted, turned off) and the
-- pool agent (queued, terminal set up, signed in / refused and why, EA started /
-- failed and why, protection active / quiet / resumed). `message` is safe to
-- show the trader; `detail` holds the evidence for support (MetaTrader journal
-- lines, provisioning errors). `handled_at` is set when support has dealt with
-- a problem, so the admin inbox shows each one once.
create table if not exists public.connection_events (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now(),
  source text not null check (source in ('web', 'agent', 'ea')),
  kind text not null check (length(kind) <= 40),
  level text not null check (level in ('info', 'warn', 'error')),
  message text not null check (length(message) <= 600),
  detail jsonb,
  handled_at timestamptz
);

create index if not exists connection_events_account_at on public.connection_events (account_id, at desc);
create index if not exists connection_events_problems on public.connection_events (at desc) where level <> 'info';

alter table public.connection_events enable row level security;

-- Traders read their own log; nobody but the service role writes.
create policy "connection_events_select_own" on public.connection_events
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Supabase's default grants include TRUNCATE/REFERENCES/TRIGGER: revoke all.
revoke all on public.connection_events from anon, authenticated;
grant select on public.connection_events to authenticated;

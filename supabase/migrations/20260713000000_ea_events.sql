-- ============================================================================
-- ea_events: EA lifecycle telemetry (removal detection, connection loss).
-- Deliberately NOT violations: an event here carries no discipline-score
-- penalty. The dashboard reads the latest row to turn a vague "EA offline"
-- into the honest "EA was removed" warning when removal is what happened.
-- ============================================================================
create table if not exists public.ea_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,

  event_type text not null check (event_type in ('EA_REMOVED', 'CONNECTION_LOST')),
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.ea_events enable row level security;

create policy "ea_events_all_own" on public.ea_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists ea_events_account_occurred_idx
  on public.ea_events (account_id, occurred_at desc);

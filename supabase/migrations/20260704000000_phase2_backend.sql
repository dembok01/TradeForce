-- Phase 2 backend readiness: primary-account uniqueness, equity history,
-- and config versioning for EA force-sync.

-- ============================================================================
-- 1. One primary account per user, enforced by the database.
-- getOrCreatePrimaryAccount's read-then-insert could race (two parallel first
-- reads on a fresh dashboard both inserting), leaving two primaries and making
-- every later maybeSingle() fail. Demote any existing duplicates (keep the
-- oldest row), then make the invariant structural.
-- ============================================================================
update public.accounts a
set is_primary = false
where a.is_primary
  and exists (
    select 1
    from public.accounts b
    where b.user_id = a.user_id
      and b.is_primary
      and (b.created_at < a.created_at
        or (b.created_at = a.created_at and b.id < a.id))
  );

create unique index if not exists accounts_one_primary_per_user_idx
  on public.accounts (user_id)
  where is_primary;

-- ============================================================================
-- 2. account_snapshots: append-only equity history, written by the EA's
-- POST /api/ea/account alongside the in-place accounts.current_equity update.
-- Exists BEFORE any EA ships because history can't be backfilled. Owner-only
-- SELECT; inserts come exclusively from the service-role EA path.
-- ============================================================================
create table if not exists public.account_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,

  equity numeric(14, 2) not null,
  balance numeric(14, 2),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.account_snapshots enable row level security;

create policy "account_snapshots_select_own" on public.account_snapshots
  for select using (auth.uid() = user_id);

create index if not exists account_snapshots_account_recorded_idx
  on public.account_snapshots (account_id, recorded_at desc);

-- ============================================================================
-- 3. config_version on trading_rules: bumped on every update so the EA can
-- cheap-poll GET /api/ea/ping and only re-fetch/apply config when the version
-- changes — the force-sync path without per-user infrastructure.
-- ============================================================================
alter table public.trading_rules
  add column if not exists config_version integer not null default 1;

create or replace function public.bump_trading_rules_version()
returns trigger
language plpgsql
as $$
begin
  new.config_version := old.config_version + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trading_rules_bump_version on public.trading_rules;
create trigger trading_rules_bump_version
  before update on public.trading_rules
  for each row execute procedure public.bump_trading_rules_version();

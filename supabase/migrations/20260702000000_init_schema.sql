-- TradeForce Phase 1 schema
-- Every user-owned table carries user_id directly (denormalized) so RLS policies
-- stay simple auth.uid() checks instead of join-based policies.

-- ============================================================================
-- profiles: 1:1 extension of auth.users
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- accounts: a trading account a user is running discipline enforcement on.
-- Phase 1 has no live EA, so `equity` is a manually-set or null starting point.
-- ============================================================================
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Primary Account',
  broker text,
  starting_balance numeric(14, 2),
  current_equity numeric(14, 2),
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.accounts enable row level security;

create policy "accounts_all_own" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists accounts_user_id_idx on public.accounts (user_id);

-- ============================================================================
-- trading_rules: the discipline rule config a user sets (Rule Settings page +
-- Session Control page both write to this one row per account).
-- ============================================================================
create table if not exists public.trading_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,

  -- Rule Settings page
  daily_loss_limit numeric(14, 2),
  max_trades_per_day integer,
  max_open_positions integer,
  risk_per_trade_percent numeric(5, 2),

  -- Session Control page
  session_london_enabled boolean not null default false,
  session_new_york_enabled boolean not null default false,
  session_asian_enabled boolean not null default false,
  session_london_ny_overlap_enabled boolean not null default false,
  custom_session_start time,
  custom_session_end time,
  timezone text not null default 'UTC',

  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (account_id)
);

alter table public.trading_rules enable row level security;

create policy "trading_rules_all_own" on public.trading_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists trading_rules_user_id_idx on public.trading_rules (user_id);
create index if not exists trading_rules_account_id_idx on public.trading_rules (account_id);

-- ============================================================================
-- trades: journal entries. Phase 1 = manual entry only. `source` distinguishes
-- manual rows from future EA-reported rows so Phase 2 can add EA rows without
-- a schema change.
-- ============================================================================
create type public.trade_direction as enum ('LONG', 'SHORT');
create type public.trade_source as enum ('MANUAL', 'EA');

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,

  symbol text not null,
  direction public.trade_direction not null,
  entry_price numeric(18, 6) not null,
  exit_price numeric(18, 6),
  quantity numeric(14, 4),
  pnl numeric(14, 2),
  entry_time timestamptz not null,
  exit_time timestamptz,
  notes text,
  source public.trade_source not null default 'MANUAL',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trades enable row level security;

create policy "trades_all_own" on public.trades
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists trades_user_id_idx on public.trades (user_id);
create index if not exists trades_account_id_idx on public.trades (account_id);
create index if not exists trades_entry_time_idx on public.trades (entry_time);

-- ============================================================================
-- violations: logged rule breaches. Phase 1 has no EA to generate these yet,
-- so the UI must render a real empty state, but the table/shape is final.
-- ============================================================================
create type public.violation_type as enum (
  'OVERTRADING',
  'OUTSIDE_SESSION',
  'DAILY_LOSS_BREACH',
  'OPEN_POSITIONS_BREACH',
  'RISK_PER_TRADE_BREACH'
);

create table if not exists public.violations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  trade_id uuid references public.trades (id) on delete set null,

  type public.violation_type not null,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.violations enable row level security;

create policy "violations_all_own" on public.violations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists violations_user_id_idx on public.violations (user_id);
create index if not exists violations_account_id_idx on public.violations (account_id);
create index if not exists violations_occurred_at_idx on public.violations (occurred_at);

-- ============================================================================
-- discipline_scores: one row per account per day, 4 named factors + total.
-- Phase 1: computed on read from trades/violations if no row exists yet
-- (see app/lib logic) rather than a scheduled job, since there's no EA feed.
-- ============================================================================
create table if not exists public.discipline_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,

  score_date date not null,
  rule_adherence_score numeric(5, 2) not null default 100,
  session_adherence_score numeric(5, 2) not null default 100,
  overtrading_prevention_score numeric(5, 2) not null default 100,
  risk_management_score numeric(5, 2) not null default 100,
  total_score numeric(5, 2) not null default 100,

  computed_at timestamptz not null default now(),

  unique (account_id, score_date)
);

alter table public.discipline_scores enable row level security;

create policy "discipline_scores_all_own" on public.discipline_scores
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists discipline_scores_user_id_idx on public.discipline_scores (user_id);
create index if not exists discipline_scores_account_id_idx on public.discipline_scores (account_id);

-- ============================================================================
-- api_keys: per-user keys the future EA authenticates with (Phase 2 consumer,
-- issuance UI ships in Phase 1). Only a salted hash + short prefix are stored;
-- the raw key is shown once at creation time and never persisted.
-- ============================================================================
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,

  label text not null default 'EA Key',
  key_prefix text not null,
  key_hash text not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.api_keys enable row level security;

create policy "api_keys_all_own" on public.api_keys
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists api_keys_user_id_idx on public.api_keys (user_id);
create unique index if not exists api_keys_key_hash_idx on public.api_keys (key_hash);

-- ============================================================================
-- contact_messages: landing page enquiry form. Public insert, no public read.
-- ============================================================================
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;

create policy "contact_messages_insert_anyone" on public.contact_messages
  for insert with check (true);

-- No select policy: only accessible via service_role (e.g. an admin view later).

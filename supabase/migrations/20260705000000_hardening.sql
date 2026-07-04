-- TradeForce hardening: EA ingestion idempotency, query-shape indexes,
-- RLS initplan optimization, write-path sanity checks, and SQL aggregation
-- functions (analytics buckets + equity sparkline downsampling).

-- ============================================================================
-- 1. EA ingestion idempotency. The EA retries failed POSTs; a retry whose
-- first attempt actually committed (e.g. response lost to a timeout) must not
-- double-count a trade or violation. Old EA builds that don't send these ids
-- keep working — the columns are nullable and the indexes partial.
-- ============================================================================
alter table public.trades add column if not exists broker_deal_id text;
create unique index if not exists trades_account_broker_deal_idx
  on public.trades (account_id, broker_deal_id)
  where broker_deal_id is not null;

alter table public.violations add column if not exists event_id text;
create unique index if not exists violations_account_event_idx
  on public.violations (account_id, event_id)
  where event_id is not null;

-- ============================================================================
-- 2. Composite indexes matching the real read shapes (account + time range +
-- order by time). The account_id-only indexes are superseded by the
-- composites' leading column; the standalone time indexes stay for the
-- cross-account cron query.
-- ============================================================================
create index if not exists trades_account_entry_time_idx
  on public.trades (account_id, entry_time desc);
drop index if exists public.trades_account_id_idx;

create index if not exists violations_account_occurred_at_idx
  on public.violations (account_id, occurred_at desc);
drop index if exists public.violations_account_id_idx;

create index if not exists api_keys_account_id_idx
  on public.api_keys (account_id);

-- Retention pruning deletes by recorded_at across all accounts; the existing
-- (account_id, recorded_at) composite can't serve that scan.
create index if not exists account_snapshots_recorded_at_idx
  on public.account_snapshots (recorded_at);

-- ============================================================================
-- 3. RLS initplan optimization: (select auth.uid()) is evaluated once per
-- query instead of once per candidate row (Supabase's documented guidance).
-- ============================================================================
alter policy "profiles_select_own" on public.profiles
  using ((select auth.uid()) = id);
alter policy "profiles_update_own" on public.profiles
  using ((select auth.uid()) = id);
alter policy "accounts_all_own" on public.accounts
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "trading_rules_all_own" on public.trading_rules
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "trades_all_own" on public.trades
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "violations_all_own" on public.violations
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "discipline_scores_all_own" on public.discipline_scores
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "api_keys_all_own" on public.api_keys
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "account_snapshots_select_own" on public.account_snapshots
  using ((select auth.uid()) = user_id);

-- ============================================================================
-- 4. Write-path sanity checks. The service-role EA path bypasses RLS, so
-- these backstop the app-level zod bounds. NOT VALID: enforced for new writes
-- only, so no pre-existing row can block the migration.
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trades_entry_price_positive') then
    alter table public.trades
      add constraint trades_entry_price_positive check (entry_price > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trades_quantity_nonnegative') then
    alter table public.trades
      add constraint trades_quantity_nonnegative check (quantity is null or quantity >= 0) not valid;
  end if;
end $$;

-- ============================================================================
-- 5. Analytics aggregation in SQL: replaces shipping six months of trade rows
-- to the app to bucket in JS. Buckets are computed on the account's wall
-- clock (p_tz); weeks start on SUNDAY to match the web app's date-fns
-- semantics (Postgres date_trunc weeks are Monday-based, hence the ±1 day
-- shift). Only pnl-recorded trades count, mirroring the previous query.
-- Day rows cover the last 7 local days, week rows the last 8 weeks, month
-- rows the last 6 months (month totals also feed win rate).
-- ============================================================================
create or replace function public.trades_pnl_buckets(p_account_id uuid, p_tz text)
returns table (kind text, bucket_date date, pnl numeric, trade_count integer, win_count integer)
language sql
stable
security invoker
set search_path = public
as $$
  with local_trades as (
    select
      t.pnl,
      (t.entry_time at time zone p_tz) as lt
    from trades t
    where t.account_id = p_account_id
      and t.pnl is not null
      and t.entry_time >= ((date_trunc('month', now() at time zone p_tz) - interval '5 months') at time zone p_tz)
  )
  select 'day'::text,
         date_trunc('day', lt)::date,
         sum(pnl), count(*)::int, (count(*) filter (where pnl > 0))::int
  from local_trades
  where lt >= date_trunc('day', now() at time zone p_tz) - interval '6 days'
  group by 2
  union all
  select 'week',
         (date_trunc('week', lt + interval '1 day') - interval '1 day')::date,
         sum(pnl), count(*)::int, (count(*) filter (where pnl > 0))::int
  from local_trades
  where lt >= (date_trunc('week', (now() at time zone p_tz) + interval '1 day') - interval '1 day') - interval '7 weeks'
  group by 2
  union all
  select 'month',
         date_trunc('month', lt)::date,
         sum(pnl), count(*)::int, (count(*) filter (where pnl > 0))::int
  from local_trades
  group by 2
$$;

-- ============================================================================
-- 6. Equity sparkline: bucket-averaged downsample of account_snapshots so
-- the dashboard never pulls raw 60-second-cadence history (~1.4k rows/day).
-- Default: last 24h in 96 buckets (15-minute averages).
-- ============================================================================
create or replace function public.equity_sparkline(p_account_id uuid, p_hours integer default 24, p_buckets integer default 96)
returns table (bucket_start timestamptz, equity numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    to_timestamp(floor(extract(epoch from s.recorded_at) / w.width) * w.width) as bucket_start,
    avg(s.equity) as equity
  from account_snapshots s,
       (select greatest(p_hours * 3600.0 / greatest(p_buckets, 1), 1) as width) w
  where s.account_id = p_account_id
    and s.recorded_at >= now() - make_interval(hours => p_hours)
  group by 1
  order by 1
$$;

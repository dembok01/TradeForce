-- Ops console: outage history and fleet rollups.
--
-- account_snapshots is written every ~60s by the EA, so every row is proof the
-- EA was alive at that instant and every GAP is an outage. That gives weeks of
-- uptime history for free -- no new telemetry, no new writes. This is the query
-- that makes a 48h weekend freeze impossible to miss.

-- Gaps in an account's heartbeat. Done in SQL with a window function because
-- the naive version pulls ~22k rows per account into the app just to diff them.
create or replace function public.ea_outages(
  p_account_id  uuid,
  p_since       timestamptz default now() - interval '30 days',
  p_min_minutes int default 20
)
returns table (started_at timestamptz, ended_at timestamptz, minutes numeric)
language sql
stable
security definer
set search_path = public
as $$
  with h as (
    select recorded_at,
           lag(recorded_at) over (order by recorded_at) as prev
    from public.account_snapshots
    where account_id = p_account_id
      and recorded_at >= p_since
  )
  select prev, recorded_at,
         round(extract(epoch from (recorded_at - prev)) / 60.0, 1)
  from h
  where prev is not null
    and recorded_at - prev > make_interval(mins => p_min_minutes)
  order by prev desc;
$$;

-- Uptime percentage over a window, derived the same way.
create or replace function public.ea_uptime_pct(
  p_account_id uuid,
  p_since      timestamptz default now() - interval '7 days',
  p_min_minutes int default 20
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select greatest(0, round(
    100.0 * (1 - coalesce(
      (select sum(extract(epoch from (recorded_at - prev)))
       from (
         select recorded_at, lag(recorded_at) over (order by recorded_at) as prev
         from public.account_snapshots
         where account_id = p_account_id and recorded_at >= p_since
       ) g
       where prev is not null
         and recorded_at - prev > make_interval(mins => p_min_minutes)
      ), 0
    ) / nullif(extract(epoch from (now() - p_since)), 0)
  ), 2));
$$;

-- Ops-only. The console reads through the service role; no client ever calls these.
revoke all on function public.ea_outages(uuid, timestamptz, int) from anon, authenticated;
revoke all on function public.ea_uptime_pct(uuid, timestamptz, int) from anon, authenticated;

-- Fleet-wide version. The per-account function above is fine on a detail page,
-- but the outages LIST would otherwise be one round trip per account -- fine at
-- 4 users, 400 round trips at 200. One scan, partitioned by account, instead.
create or replace function public.ea_outages_all(
  p_since       timestamptz default now() - interval '30 days',
  p_min_minutes int default 20
)
returns table (account_id uuid, started_at timestamptz, ended_at timestamptz, minutes numeric)
language sql
stable
security definer
set search_path = public
as $$
  with h as (
    select account_id, recorded_at,
           lag(recorded_at) over (partition by account_id order by recorded_at) as prev
    from public.account_snapshots
    where recorded_at >= p_since
  )
  select account_id, prev, recorded_at,
         round(extract(epoch from (recorded_at - prev)) / 60.0, 1)
  from h
  where prev is not null
    and recorded_at - prev > make_interval(mins => p_min_minutes)
  order by prev desc;
$$;

revoke all on function public.ea_outages_all(timestamptz, int) from anon, authenticated;

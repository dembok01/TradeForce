-- Ops telemetry for the internal admin console.
--
-- Designed around the three incidents that each ran for DAYS undetected:
--   1. weekend clock freeze  -> caught by EA freshness (api_keys.last_used_at, already collected)
--   2. retry storm 60 req/min -> caught by ea_failed_fetches, which needs the EA to COUNT
--      locally and report on the next successful call: a failure to reach the server can
--      never be reported at the time it happens.
--   3. upstream 403 throttling -> caught by ea_last_http_status + request rate

-- One row per pool server. The agent already polls every 15s; it stamps this on
-- the same pass. If the agent dies, the stale last_seen_at IS the alert -- no
-- inbound port or push channel needed.
create table if not exists public.pool_servers (
  host           text primary key,
  cores          int,
  ram_total_mb   int,
  ram_free_mb    int,
  disk_free_mb   int,
  load_1m        numeric(6, 2),
  instances      int not null default 0,
  capacity       int,
  image_tag      text,
  agent_version  text,
  last_seen_at   timestamptz not null default now()
);

alter table public.pool_servers enable row level security;
-- No policy: admins read through the service role. Clients never see this.
revoke all on public.pool_servers from anon, authenticated;

-- Per-instance runtime, written by the agent.
alter table public.mt5_instances
  add column if not exists cpu_cores   numeric(5, 2),  -- cgroup delta, the number that sizes a fleet
  add column if not exists mem_mb      int,
  add column if not exists restarts    int not null default 0,
  add column if not exists started_at  timestamptz;

-- Per-instance EA self-report, written by /api/ea/account.
-- ea_failed_fetches is the single most valuable column here: it is the only way
-- the server can learn about requests that never arrived.
alter table public.mt5_instances
  add column if not exists ea_version          text,
  add column if not exists ea_failed_fetches   int,
  add column if not exists ea_last_http_status int,
  add column if not exists ea_queued_posts     int,
  add column if not exists ea_from_cache       boolean,
  add column if not exists ea_backoff_seconds  int,
  add column if not exists ea_reported_at      timestamptz;

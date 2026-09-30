-- "Does this address actually answer as a MetaTrader server?", asked from the
-- admin console and answered by a pool box.
--
-- Nothing can be verified from the web app: reaching an MT5 server means
-- speaking its protocol, and a TCP connection proves nothing - mt5.roboforex.com
-- and mt5.xm.com both accept connections on 443 and neither is an MT5 server
-- (tested 29 Sep 2026). The only honest test is to let a real terminal try, with
-- a login that was never valid:
--
--   "authorization on <addr> failed (Invalid account)" -> a real MT5 server
--   "no connection to <addr>", or no attempt at all    -> a website, or nothing
--
-- Only a pool box can do that, so the console writes a row here and the agent
-- picks it up within a poll - the same shape as provisioning, which keeps the
-- web app free of any inbound channel or SSH credentials.
--
-- The probe cannot report the broker's own server name: asked by address,
-- MetaTrader echoes the address back. A canonical name only appears when a real
-- account signs in, which is what mt5_brokers.verified_server records.
create table if not exists public.broker_probes (
  id      bigint generated always as identity primary key,
  address text not null check (length(address) between 3 and 120),
  requested_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  -- Which pool box ran it, once one claims the job.
  host    text check (length(host) <= 60),
  status  text not null default 'queued' check (status in ('queued', 'running', 'done')),
  result  text check (result in ('reached', 'not_reached', 'error')),
  -- The MetaTrader journal line the verdict was taken from, shown to the admin
  -- so the answer can be checked rather than trusted.
  evidence text check (length(evidence) <= 600),
  finished_at timestamptz
);

-- The agent's only query: the oldest job still waiting.
create index if not exists broker_probes_queued on public.broker_probes (requested_at)
  where status = 'queued';
-- The console shows each address's latest answer.
create index if not exists broker_probes_latest on public.broker_probes (address, requested_at desc);

alter table public.broker_probes enable row level security;

-- Deliberately no policy: a probe starts a container on a production box, so it
-- is the service role's alone - the admin console and the pool agent. RLS stays
-- on so a future grant cannot quietly open it up.
revoke all on public.broker_probes from anon, authenticated;

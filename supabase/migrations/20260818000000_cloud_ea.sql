-- Cloud EA: one row per user's hosted MT5 terminal.
--
-- Design note: the pool servers PULL from this table (poll every ~15s and make
-- Docker match desired_state). Nothing pushes to them, so there is no inbound
-- API, TLS cert, bearer token or firewall rule on the pool side, and a server
-- that reboots self-heals by simply polling again.

create table if not exists public.mt5_instances (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,

  -- Broker credentials. mt5_password_cipher and ea_key_cipher are AES-256-GCM
  -- ("iv.tag.ciphertext", each base64). The key lives only in env vars on the
  -- web app and the pool servers. Column grants below make these two columns
  -- unreadable to end users -- enforced by Postgres, not by convention.
  mt5_login           text not null,
  mt5_server          text not null,
  mt5_password_cipher text not null,
  ea_key_cipher       text not null,
  api_key_id          uuid references public.api_keys (id) on delete set null,

  -- null server_host = unclaimed; the first pool server with spare capacity
  -- claims it.
  server_host   text,
  desired_state text not null default 'running'
                check (desired_state in ('running', 'stopped', 'removed')),
  status        text not null default 'pending'
                check (status in ('pending','provisioning','running','stopped',
                                  'login_failed','error','removed')),
  status_detail text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mt5_instances_claim_idx
  on public.mt5_instances (server_host)
  where desired_state <> 'removed';

alter table public.mt5_instances enable row level security;

-- Users may read their own row's STATUS only. The two cipher columns are
-- withheld at the column level, so even a mistaken `select *` from the client
-- cannot leak them. The pool agent bypasses all of this via the service role.
create policy "own instance" on public.mt5_instances
  for select using ((select auth.uid()) = user_id);

revoke all on public.mt5_instances from anon, authenticated;
grant select (account_id, user_id, mt5_login, mt5_server, server_host,
              desired_state, status, status_detail, created_at, updated_at)
  on public.mt5_instances to authenticated;

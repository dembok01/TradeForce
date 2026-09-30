-- Let a check be raised on a trader's behalf, not just from the admin console.
--
-- When an account cannot sign in, the address is the first thing to doubt, and
-- until now someone had to notice and ask. The agent now raises one check per
-- unknown address by itself and, with the account attached, writes the answer
-- back to that trader's connection events - so "your broker's address is not a
-- MetaTrader server" reaches the person who is stuck instead of waiting for an
-- admin to go looking.
--
-- Nullable: a check raised from the console belongs to no account.
alter table public.broker_probes
  add column if not exists account_id uuid references public.accounts (id) on delete cascade;

-- The agent asks "have we already checked this address for this account?"
-- before raising another, so one bad address costs one terminal, not one per
-- reconnect attempt.
create index if not exists broker_probes_by_account on public.broker_probes (account_id)
  where account_id is not null;

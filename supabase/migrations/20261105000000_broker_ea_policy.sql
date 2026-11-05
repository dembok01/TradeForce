-- Which brokers are prop firms, and what their contract says about EAs.
--
-- A funded account must not use the hosted pool, and the reason is not the IP
-- address: it is credential custody. Every firm checked requires the named
-- account holder to place the trades, and hosting means we hold the password.
-- Read 2 Nov 2026 from the firms' own pages:
--
--   Maven Trading       cl. 4.1 bans "EAs, bots, scripts and automated
--                       trading" outright, on every platform, and separately
--                       bans third-party account management and credential
--                       sharing. Nothing we can build makes this one work.
--   Alpha Capital       permits EAs and will review and approve one in
--                       advance; a VPS is allowed only with a static IP
--                       disclosed beforehand. Still requires trades by the
--                       named holder, so hosted is out, client-side is in.
--   E8 Markets          permits EAs but limits one strategy per user and warns
--                       that multiple users on the same EA may be terminated.
--                       Every TradeForce customer runs the identical file, so
--                       this needs a written ruling before we onboard anyone.
--   Funded Trading Plus published sources conflict on whether approval is
--                       required. Treated as approval_required until they
--                       answer in writing.
--
-- Null means an ordinary broker and changes nothing. Non-null marks a prop firm
-- and routes the trader to the downloadable EA instead of the hosted terminal
-- (src/lib/actions/cloud-ea.ts refuses hosted provisioning for these rows, so
-- typing the address by hand does not get round the dropdown).
--
-- This is deliberately a column and not a hardcoded list: mt5_brokers was moved
-- out of code precisely so an admin can add a broker without a deploy, and a
-- new prop firm appears far more often than a new schema.
alter table public.mt5_brokers
  add column if not exists ea_policy text
    check (ea_policy in ('allowed', 'approval_required', 'prohibited'));

comment on column public.mt5_brokers.ea_policy is
  'Null for an ordinary broker. Non-null marks a prop firm: hosted terminals are '
  'refused and the trader is sent to the downloadable EA. prohibited = the firm '
  'bans EAs outright, so we cannot protect the account at all.';

update public.mt5_brokers
   set ea_policy = 'prohibited', updated_at = now()
 where address = 'mt5.maventrading.com:443'
   and ea_policy is distinct from 'prohibited';

update public.mt5_brokers
   set ea_policy = 'approval_required', updated_at = now()
 where address in (
         'mt5.alphacapitalgroup.uk:443',
         'mt5.e8markets.com:443',
         'mt5.fundedtradingplus.com:443'
       )
   and ea_policy is distinct from 'approval_required';

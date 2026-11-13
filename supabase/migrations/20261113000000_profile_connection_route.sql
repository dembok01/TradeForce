-- How this trader connects, asked once at onboarding and used to send them to
-- the right setup page afterwards.
--
--   'broker' -> the hosted pool: we hold the credentials and run the terminal.
--   'funded' -> their own MetaTrader: a prop firm requires the named holder to
--               place the trades, so we must not hold the password at all.
--
-- It decides a redirect and which cross-link is offered, never an entitlement:
-- the hosted pool's actual refusal stays eaPolicyFor() on a catalogued address,
-- enforced in enableCloudEaAction. A trader who picks wrong is not locked out.
--
-- experience_level is left in place deliberately. The question it answered
-- ("where are you in the prop-firm journey") is no longer asked, but the rows
-- already carry answers and dropping a column to tidy up is not worth it.
alter table public.profiles
  add column if not exists connection_route text;

comment on column public.profiles.connection_route is
  'broker = hosted pool, funded = client-side EA. Set at onboarding; routing only, not an entitlement.';

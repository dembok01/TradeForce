-- The broker list behind the "Connect your account" picker, moved out of code.
--
-- It lived in src/lib/mt5-brokers.ts, so adding a broker meant a developer, an
-- edit and a deploy. A trader whose broker is missing types the address in by
-- hand instead, and that is where it goes wrong: of eleven live accounts, ten
-- picked from the dropdown and the one typed address was the one that never
-- connected (demo.icmarkets.com:443 - resolves, refuses every connection, and
-- sat on "Connecting" for nineteen hours).
--
-- What is stored is an ADDRESS, not a broker name. MT5 resolves `Server=<name>`
-- only when that name is already inside the image's encrypted Config/servers.dat,
-- and ours holds only MetaQuotes plus a hand-seeded Exness - re-confirmed by
-- experiment 29 Sep 2026, where Alpari-MT5-Demo did not resolve even though we
-- connect to Alpari daily by address. `Server=<host:port>` works for any broker
-- with no pre-registration, so addresses are the only general mechanism.
--
-- Exness is deliberately NOT here. It publishes no addresses and is connected by
-- server NAME through that seeded servers.dat, so its ~53 entries stay generated
-- in code beside the regex that recognises them; they are not rows an admin
-- would ever edit.
create table if not exists public.mt5_brokers (
  id      bigint generated always as identity primary key,
  broker  text not null check (length(broker) between 1 and 80),
  -- Which of that broker's servers, as a trader would recognise it.
  label   text not null check (length(label) between 1 and 80),
  -- Written verbatim into the terminal's tf.ini. Unique: one row per server.
  address text not null unique check (length(address) between 3 and 120),
  kind    text not null check (kind in ('demo', 'live')),
  -- Hidden from the picker without losing the row, so a broker that breaks can
  -- be taken down in seconds and put back when it is fixed.
  enabled boolean not null default true,
  -- Where a trader finds which server their account is on. Held per row rather
  -- than per broker to avoid a second table; the picker shows the first row of
  -- that broker that has one.
  help    text check (length(help) <= 600),
  -- Set when MetaTrader itself confirmed the address answers as a trading
  -- server, and the server name it reported ("Alpari-MT5-Demo"). Nothing is
  -- guessed into this list: a wrong address fails at login with a message the
  -- trader cannot act on.
  verified_at     timestamptz,
  verified_server text check (length(verified_server) <= 80),
  source  text not null default 'admin' check (source in ('seed', 'admin', 'trader')),
  note    text check (length(note) <= 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The picker's only query: enabled rows, grouped by broker.
create index if not exists mt5_brokers_picker on public.mt5_brokers (broker, label) where enabled;

alter table public.mt5_brokers enable row level security;

-- A broker's public access point is not a secret, and every signed-in trader
-- needs the list to choose from. Writes are the service role's alone, so the
-- admin console is the only way in.
create policy "mt5_brokers_select_enabled" on public.mt5_brokers
  for select to authenticated
  using (enabled);

-- Supabase's default grants include TRUNCATE/REFERENCES/TRIGGER: revoke all.
revoke all on public.mt5_brokers from anon, authenticated;
grant select on public.mt5_brokers to authenticated;

-- Seeded from the hardcoded list this replaces. Each was confirmed on
-- 20 Sep 2026 by infra/pool-agent/verify-brokers.sh, which signs in to the
-- address with a deliberately invalid login: "authorization on <addr> failed
-- (Invalid account)" means a real MT5 server answered, "no connection to <addr>"
-- means it is a website or nothing.
insert into public.mt5_brokers (broker, label, address, kind, source, verified_at)
values
  ('Admirals', 'Main server', 'mt5.admiralmarkets.com:443', 'live', 'seed', '2026-09-20'),
  ('Alpari', 'Alpari-MT5-Demo (demo accounts)', 'dc1.mt5demo.alpari.com:443', 'demo', 'seed', '2026-09-20'),
  ('Alpari', 'Alpari-MT5 (real accounts)', 'dc1.mt5.alpari.com:443', 'live', 'seed', '2026-09-20'),
  ('Alpha Capital', 'Main server', 'mt5.alphacapitalgroup.uk:443', 'live', 'seed', '2026-09-20'),
  ('Blueberry Markets', 'Demo', 'mt5.demo.blueberrymarkets.com:443', 'demo', 'seed', '2026-09-20'),
  ('Blueberry Markets', 'Live', 'mt5.live.blueberrymarkets.com:443', 'live', 'seed', '2026-09-20'),
  ('Deriv', 'Main server', 'mt5.deriv.com:443', 'live', 'seed', '2026-09-20'),
  ('E8 Markets', 'Main server', 'mt5.e8markets.com:443', 'live', 'seed', '2026-09-20'),
  ('Equiti', 'Demo 1', 'mt5-demo1.equiti.com:443', 'demo', 'seed', '2026-09-20'),
  ('Equiti', 'Live 1', 'mt5-live1.equiti.com:443', 'live', 'seed', '2026-09-20'),
  ('Equiti', 'Live 2', 'mt5-live2.equiti.com:443', 'live', 'seed', '2026-09-20'),
  ('Forex.com', 'Main server', 'mt5.forex.com:443', 'live', 'seed', '2026-09-20'),
  ('Funded Trading Plus', 'Main server', 'mt5.fundedtradingplus.com:443', 'live', 'seed', '2026-09-20'),
  ('Fusion Markets', 'Demo', 'mt5-demo.fusionmarkets.com:443', 'demo', 'seed', '2026-09-20'),
  ('Global Prime', 'Demo', 'mt5-demo.globalprime.com:443', 'demo', 'seed', '2026-09-20'),
  ('IC Markets', 'Demo', 'mt5-demo.icmarkets.com:443', 'demo', 'seed', '2026-09-20'),
  ('IC Markets', 'Main server', 'mt5.icmarkets.com:443', 'live', 'seed', '2026-09-20'),
  ('IG', 'Main server', 'mt5.ig.com:443', 'live', 'seed', '2026-09-20'),
  ('Maven Trading', 'Main server', 'mt5.maventrading.com:443', 'live', 'seed', '2026-09-20'),
  ('MetaQuotes', 'Demo (test account)', '129.232.146.42:1950', 'demo', 'seed', '2026-09-20'),
  ('MultiBank', 'Main server', 'mt5.multibankfx.com:443', 'live', 'seed', '2026-09-20'),
  ('Pepperstone', 'Demo 1', 'mt5-demo1.pepperstone.com:443', 'demo', 'seed', '2026-09-20'),
  ('Pepperstone', 'Live 1', 'mt5-live1.pepperstone.com:443', 'live', 'seed', '2026-09-20'),
  ('Pepperstone', 'Live 2', 'mt5-live2.pepperstone.com:443', 'live', 'seed', '2026-09-20'),
  ('Swissquote', 'Main server', 'mt5.swissquote.com:443', 'live', 'seed', '2026-09-20'),
  ('Weltrade', 'Demo', 'mt5.demo.weltrade.com:443', 'demo', 'seed', '2026-09-20')
on conflict (address) do nothing;

-- The one piece of per-broker guidance that was in the code's BROKER_HELP and
-- belongs to an address-based broker. Exness's stays in code with its generated
-- entries.
update public.mt5_brokers
   set help = 'Demo accounts are on Alpari-MT5-Demo and real accounts on Alpari-MT5. '
           || 'It''s in Alpari''s account email, and in MetaTrader under File → Login to Trade Account.'
 where broker = 'Alpari' and help is null;

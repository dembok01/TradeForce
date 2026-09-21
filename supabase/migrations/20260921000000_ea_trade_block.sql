-- Why the EA cannot place or close trades on this account right now, as last
-- reported by the EA (v1.27+): ALGO_TRADING_OFF, EA_TRADING_OFF,
-- BROKER_BLOCKS_EA, ACCOUNT_READ_ONLY, NO_CONNECTION. Null = it can.
--
-- On accounts rather than mt5_instances because desktop EAs report it too, and
-- they have no instance row. Written by the EA routes and the pool agent's
-- bridge (service role). accounts_all_own also lets the owner write it, which
-- can only change the warning on their own dashboard.
alter table public.accounts add column if not exists ea_trade_block text;

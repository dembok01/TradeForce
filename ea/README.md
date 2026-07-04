# TradeForce EA (MetaTrader 5)

The Expert Advisor that closes the loop: it polls the TradeForce backend for the
user's charter, enforces all five rules inside the terminal (violating trades are
closed immediately), and reports trades, violations, and equity back to the app.

**Current version: 1.10.** Since 1.00: reports now carry idempotency keys
(`brokerDealId` on trades, `eventId` on violations) so a retry after a network
drop can't double-count a trade's P/L or log the same breach twice, and
single-window session violations include the allowed window bounds. Recompile
and re-drop the `.ex5` (below) to pick these up.

```
ea/
├── TradeForce.mq5        the EA source
└── Include/
    ├── JAson.mqh         vendored JSON library (vivazzi/JAson, MIT)
    └── JAson.LICENSE.txt
```

## Compiling (Windows machine with MetaTrader 5 + MetaEditor)

1. Open MT5 → **File → Open Data Folder**. This is the terminal data directory,
   e.g. `C:\Users\<you>\AppData\Roaming\MetaQuotes\Terminal\<hash>\`.
2. Copy `Include/JAson.mqh` into `MQL5\Include\` (the EA does `#include <JAson.mqh>`).
3. Copy `TradeForce.mq5` into `MQL5\Experts\`.
4. Compile, either way:
   - **MetaEditor GUI**: open `TradeForce.mq5`, press **F7**. Expect
     `0 errors, 0 warnings` in the Errors tab.
   - **CLI** (from a normal Command Prompt):

     ```bat
     "C:\Program Files\MetaTrader 5\metaeditor64.exe" /compile:"<data folder>\MQL5\Experts\TradeForce.mq5" /log
     ```

     The exit code is the number of *successfully compiled* files (1 = success);
     check the `.log` next to the source for errors.
5. The compiled `TradeForce.ex5` lands next to the source in `MQL5\Experts\`.

### Publishing the binary for users

Copy the compiled `TradeForce.ex5` into this repo at
`public/downloads/TradeForce.ex5`, commit, and deploy — the **EA Setup** page's
step-1 download button serves it from there. Recompile and replace the file
whenever `TradeForce.mq5` changes.

## Installing / running

1. **Whitelist the server**: MT5 → **Tools → Options → Expert Advisors** →
   tick *Allow WebRequest for listed URL* and add the exact server origin, e.g.
   `https://trade-force-rouge.vercel.app`. Without this every request fails with
   error 4014 (the EA prints a hint in the Journal when it detects this).
2. **Get an API key**: in the web app, **Rule Settings → EA access keys →
   Generate**. The `tf_live_…` key is shown once — copy it immediately.
3. **Attach the EA**: drag TradeForce from the Navigator onto any chart
   (one chart per account is enough — it enforces account-wide). In the inputs
   dialog set:

   | Input | Value |
   |---|---|
   | `ServerUrl` | `https://trade-force-rouge.vercel.app` (no trailing slash) |
   | `ApiKey` | the `tf_live_…` key |
   | `PingSeconds` | 5 (config-version check; rule changes apply within ~this) |
   | `FullSyncSeconds` | 60 (full config re-fetch) |
   | `AccountReportSeconds` | 60 (equity/balance snapshot cadence) |

4. **Enable AutoTrading** (toolbar button turns green) — required for the EA to
   close violating positions.
5. **Verify**: the MT5 **Journal**/**Experts** tab shows
   `TradeForce: config loaded`, the chart comment shows a status line, and the
   web dashboard's EA tile flips to **Connected** within a minute.

## What it enforces (and how)

MT5 cannot veto an order before execution, so enforcement is close-on-violation:
`OnTradeTransaction` sees every fill; a trade that breaks the charter is closed
immediately and a violation is POSTed to the server.

| Rule | Trigger | Violation type |
|---|---|---|
| Daily loss locked | any new trade on a locked day → closed on open | (day already locked) |
| Session windows | trade opened outside every enabled window | `OUTSIDE_SESSION` |
| Max trades / day | trade count for the local trading day exceeded | `OVERTRADING` |
| Max open positions | open-position count exceeded | `OPEN_POSITIONS_BREACH` |
| Risk per trade | stop-loss risk > limit % of equity — **no SL counts as a breach** | `RISK_PER_TRADE_BREACH` |
| Daily loss limit | realized + floating P/L for the day ≤ −limit → **all positions closed** (kill switch, checked every timer tick) | `DAILY_LOSS_BREACH` |

Details that matter:

- **Daily reset is timezone-aware** and mirrors the web app: `Asia/Kolkata`
  (+05:30), `UTC`, and `America/New_York` (EST/EDT with the US DST rule). The
  timezone comes from the server config, not the terminal clock.
- **Restart-safe counters**: trades-today and realized P/L are derived from the
  terminal's deal history since local midnight, not in-memory counters — pulling
  the EA off the chart and re-attaching doesn't reset the limits.
- **Custom session window** times are interpreted as UTC (matching the web app).
- Failed reports are queued and retried on later timer ticks (queue is
  in-memory; the server remains the durable record).
- Every closed deal is reported to `/api/ea/trades`, equity/balance to
  `/api/ea/account`, violations to `/api/ea/violations`; config comes from
  `/api/ea/config` with `/api/ea/ping` polled every `PingSeconds` for a
  `configVersion` change (force-sync).

## Live test checklist (demo account)

Run on a demo account with a small charter (e.g. daily loss $50, 2 trades/day,
1 open position, 1% risk, London session only):

1. **Connectivity** — attach EA, confirm `config loaded` in Journal, dashboard
   shows Connected, and `api_keys.last_used_at` updates.
2. **Trade reporting** — open + close a small conforming trade; it appears in
   the web Journal with source **EA** within ~a minute, with direction, lots,
   entry/exit, and P/L populated.
3. **Manual-entry lock** — with the EA connected, the web Journal's manual
   "Log trade" entry is gone and EA rows show an EA badge instead of a delete
   button.
4. **Overtrading** — open trades past the cap; the excess trade is closed
   within seconds and an `OVERTRADING` violation appears in the Violation
   Centre.
5. **Open positions** — exceed the open-position cap; same close + 
   `OPEN_POSITIONS_BREACH`.
6. **Risk per trade** — open a trade with no stop-loss (or an SL risking more
   than the limit); closed + `RISK_PER_TRADE_BREACH`.
7. **Session window** — trade outside the enabled session; closed +
   `OUTSIDE_SESSION`.
8. **Daily loss kill switch** — let floating loss cross the limit (or set the
   limit below current floating loss); *all* positions close, further trades
   that day are closed on open, `DAILY_LOSS_BREACH` logged once.
9. **Force-sync** — change a limit in Rule Settings; the chart comment reflects
   the new config within ~`PingSeconds` (the version bump is picked up by ping).
10. **Restart safety** — after a couple of trades, remove and re-attach the EA;
    the trades-today count in the chart comment is unchanged.
11. **Equity history** — confirm `account_snapshots` rows accumulate roughly
    every `AccountReportSeconds`.
12. **Idempotency (v1.10)** — after a trade reports to the Journal, disconnect
    the network briefly and take another trade so the report queues and retries;
    confirm the trade appears exactly **once** (no duplicate row), and that a
    session/overtrading violation likewise logs once even across a retry.

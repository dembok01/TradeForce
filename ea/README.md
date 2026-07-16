# TradeForce EA (MetaTrader 5)

The Expert Advisor that closes the loop: it polls the TradeForce backend for the
user's charter, enforces all five rules inside the terminal at the lowest cost
MT5 physically allows, and reports trades, violations, and equity back to the app.

**Current version: 1.20.** Since 1.10 — the zero-cost enforcement overhaul:

- **Blocking overlay**: a banner + watermark on the chart whenever trading is
  disallowed (outside session, at the daily cap, loss-locked day), with a
  countdown before the session closes. The copy states the consequence
  ("a trade placed now will be auto-closed at a loss") so a fast-close reads
  as enforcement, not a bug. Candles stay visible — it never covers the market.
- **Pending orders are truly prevented**: one placed while blocked is deleted
  before it can trigger ($0 cost) and reported; legally-placed pendings are
  swept when the session closes or the day locks (journal-only, no violation).
- **Stop-loss auto-fix**: a trade with no SL (or an SL risking more than the
  cap) gets its stop attached/tightened to exactly the risk cap instead of
  being closed — the position survives, the violation is logged, the fix
  costs $0. Falls back to closing only if the broker rejects the modify.
- **Daily-loss hard lock**: after the kill switch, the EA closes the MT5
  terminal itself (30s notice; 20s when reopened on a locked day), gated by
  the `HardLockOnLossBreach` input. The account is flat by then — the only
  trade a dead terminal prevents is the revenge trade.
- **Fail-closed connection handling**: the last good config is cached on disk
  and reloaded when the dashboard is unreachable — enforcement never switches
  off with the network.
- **Removal detection**: removing the EA from the chart fires a best-effort
  `EA_REMOVED` event; the dashboard shows "EA was removed" instead of a vague
  offline dot.
- Standardized violation payloads (`symbol`, `volume`, `ruleValue`,
  `ruleLimit` on every report) and the founder-brief priority order
  (session → positions → trades → no-SL → risk %).

Since 1.00: idempotency keys (`brokerDealId` on trades, `eventId` on
violations) and single-window session bounds in violation details. Recompile
and re-drop the `.ex5` (below) to pick any of this up.

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
   | `SessionWarnSeconds` | 300 (chart countdown before the session closes) |
   | `LossLockGraceSeconds` | 30 (notice after a daily-loss breach before MT5 closes) |
   | `ReopenGraceSeconds` | 20 (notice when MT5 is reopened during a loss-locked day) |
   | `HardLockOnLossBreach` | true (false = lock the day on-chart only, never close MT5 — for terminals running other charts/EAs) |

4. **Enable AutoTrading** (toolbar button turns green) — required for the EA to
   close violating positions.
5. **Verify**: the MT5 **Journal**/**Experts** tab shows
   `TradeForce: config loaded`, the chart comment shows a status line, and the
   web dashboard's EA tile flips to **Connected** within a minute.

## What it enforces (and how)

**What MT5 does not allow, so you don't look for it here:** a client-side EA
cannot veto a manual market order before it reaches the broker (there is no
pre-trade hook in MQL5 — true rejection exists only server-side via the MT5
Manager API, which only brokers have), and it cannot auth-gate its own
removal from the chart. Everything below is the strongest enforcement that
is actually possible, layered so violations cost as close to $0 as physics
allows:

1. **Prevention — blocking overlay.** Whenever opening anything is against
   the charter (outside session, at the daily cap, loss-locked day) a banner
   + watermark states the fact *and the consequence* on the chart, with a
   countdown before session close. Accidental violations mostly stop existing.
2. **Prevention — $0 remediation.** Pending orders placed while blocked are
   deleted before they trigger (free) and reported with
   `blockedPendingOrder: true`. A filled trade with a missing/oversized
   stop-loss gets the SL attached/tightened to exactly the risk cap via
   `PositionModify` (free) and reported with `autoFixed: true`.
3. **Fallback — fast close-on-fill.** A market order placed despite the
   overlay is closed the moment it fills (`OnTradeTransaction` on the deal).
   That close pays the spread — the trader's own rule, the trader's own cost;
   every competitor product works the same way.
4. **The one kill-switch — daily loss.** After the kill switch flattens the
   account, the EA closes the MT5 terminal (`TerminalClose`, gated by
   `HardLockOnLossBreach`) and re-closes it on reopen until local midnight.
   Safe precisely because the account is flat: nothing is left to manage, and
   the only trade a dead terminal prevents is the revenge trade.

| Rule | What happens | Violation type |
|---|---|---|
| Daily loss locked | overlay + any new trade closed on open + pendings deleted | (day already locked) |
| Session windows | overlay + countdown; pendings swept at close (no violation) / deleted if placed while blocked; market fill closed | `OUTSIDE_SESSION` |
| Max trades / day | overlay from trade #N; pending at cap deleted; market fill #N+1 closed | `OVERTRADING` |
| Max open positions | market fill over cap closed (transient state — no overlay) | `OPEN_POSITIONS_BREACH` |
| Risk per trade | **SL auto-fixed in place** (attach/tighten to cap); closed only if the broker rejects the modify | `RISK_PER_TRADE_BREACH` |
| Daily loss limit | all positions closed (kill switch, checked every second) → 30s notice → **terminal closes** (if hard lock on) | `DAILY_LOSS_BREACH` |

Details that matter:

- **Daily reset is timezone-aware** and mirrors the web app: `Asia/Kolkata`
  (+05:30), `UTC`, and `America/New_York` (EST/EDT with the US DST rule). The
  timezone comes from the server config, not the terminal clock.
- **Restart-safe counters**: trades-today and realized P/L are derived from the
  terminal's deal history since local midnight, not in-memory counters — pulling
  the EA off the chart and re-attaching doesn't reset the limits.
- **Custom session window** times are interpreted as UTC (matching the web app).
- Failed reports are queued and retried on later timer ticks (queue is
  in-memory; the server remains the durable record). Before the daily-loss
  terminal close, the queue gets a bounded hard flush so the breach report
  lands before the terminal dies.
- Every closed deal is reported to `/api/ea/trades`, equity/balance to
  `/api/ea/account`, violations to `/api/ea/violations`, lifecycle events to
  `/api/ea/events`; config comes from `/api/ea/config` with `/api/ea/ping`
  polled every `PingSeconds` for a `configVersion` change (force-sync).

## Known limitations & recovery

- **AutoTrading off degrades layers 2–3**: `PositionClose`/`OrderDelete`/
  `PositionModify` all fail, so nothing can be closed, deleted, or fixed. The
  overlay, heartbeats, violation reporting, and `TerminalClose` still work,
  and the chart shows "AUTOTRADING OFF - enforcement degraded".
- **Connection loss is fail-closed**: the last good config persists in
  `MQL5/Files/TradeForce_cfg.json` and reloads on restart, so enforcement
  continues offline ("LAST-KNOWN RULES" on the chart). Consequence: pausing
  the charter on the dashboard only unlocks once the EA can reach the server.
  Fail-open happens only if the EA has never fetched a config at all.
- **Loss-locked day recovery**: wait for your local midnight, or pause the
  charter on the dashboard (needs connectivity — picked up within
  ~`PingSeconds` and the lockdown cancels). Removing the EA also works and is
  deliberately not hidden — the product is consent-based — but it fires an
  `EA_REMOVED` event and the dashboard says so.
- **Removal detection is best-effort**: the `OnDeinit` webhook can be lost if
  the terminal dies before it lands; the stale-heartbeat dot is the backstop.
- **Mobile/web MT5 trading is invisible to the EA** while the desktop
  terminal is closed; positions opened there are enforced only once a
  terminal with the EA sees them.
- A deliberate market order raced through the overlay still costs the spread
  when the fallback closes it — no client-side design can prevent that, and
  the cost itself is the deterrent.

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
13. **Overlay (v1.20)** — set a custom session ending in ~10 minutes: the
    countdown banner appears at T-5:00; at T-0 the banner flips to "OUTSIDE
    SESSION … auto-closed at a loss" with the watermark, candles still visible
    and any open position still manageable; one alert fires per transition;
    widening the session clears it within ~`PingSeconds`.
14. **Pending prevention (v1.20)** — while out-of-session (or at the cap),
    place a limit order: deleted in under a second, `$0` P/L impact, and the
    Violation Centre row reads "Prevented — … (no cost incurred)". Place a
    legal pending in-session and let the session end: it is swept with a
    Journal line but **no** violation row.
15. **SL auto-fix (v1.20)** — open a market order with no stop-loss: within
    ~a second an SL appears at the risk-cap distance, the position survives,
    and the violation row reads "Fixed — … (no cost incurred)". Repeat with an
    oversized SL: it is tightened instead.
16. **Daily-loss hard lock (v1.20)** — breach the limit: all positions close,
    `DAILY_LOSS_BREACH` logs once, the 30s countdown shows, MT5 exits; the
    violation is on the dashboard *before* the close. Reopen MT5: a 20s notice,
    then it closes again. The dashboard dot reads "EA locked (daily loss)".
    Set `HardLockOnLossBreach=false` and repeat: the day locks on-chart only
    and the terminal stays open.
17. **Fail-closed cache (v1.20)** — kill the network, restart MT5: the Journal
    shows "enforcing last-known rules from the disk cache", the chart shows
    "LAST-KNOWN RULES", and rules are still enforced. Restore the network:
    the flag clears on the next sync.
18. **Removal detection (v1.20)** — drag the EA off the chart: an `EA_REMOVED`
    event lands and the dashboard dot flips to "EA was removed".

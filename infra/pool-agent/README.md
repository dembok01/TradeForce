# Pool agent

Runs on each pool server as `tf-agent` (systemd, env in `/etc/tradeforce.env`).
It makes local Docker match `mt5_instances.desired_state`, reports host health,
and — since v1.3 — runs the **file bridge** for hosted EAs.

| File | What |
| --- | --- |
| `tf_agent.py` | The agent. Installed at `/opt/tradeforce/agent/`, linked from `/usr/local/bin/tf-agent`. |
| `tf_bridge.py` | The file bridge: validation, relay to Supabase, rules files. No Docker, no crypto. |
| `test_tf_bridge.py` | `python3 -m unittest test_tf_bridge` (stdlib only; runs on the server too). |
| `contract/ea-payloads.json` | EA payload cases, also run against the website's zod schemas by `src/lib/ea-contract.test.ts`. |
| `bridge_proof.py` | `db-shape`: zero-write schema check against production. `run`: bridge against a stand-in database. |
| `rollout-bridge.sh` | `install`, `roll <account>…`, `gaps <hours> <account>…`, `uninstall`. |

## Why the bridge exists

Vercel's DDoS mitigation blocked the pool server's address for 31 minutes at a
time, several times a day (`x-vercel-mitigated: deny`). The Hobby plan has no
bypass. While blocked, hosted EAs could not receive rule changes or report
violations. Supabase has never blocked this address.

In bridge mode (EA v1.26, `BridgeMode=true`) a hosted EA makes no web requests:

```
EA  --writes-->  MQL5/Files/tf_bridge/out/<epoch>-<tick>-<seq>-<kind>.json  --agent-->  Supabase
EA  <--reads---  MQL5/Files/tf_bridge/in/config.json                        <--agent--  trading_rules
```

* **Reports** use the same JSON bodies the EA would POST; the agent validates
  them exactly as the routes do and writes the same rows (same dedupe on
  `broker_deal_id` / `event_id`). The account is the folder, never the file.
* **Rules** are polled every 3s (only rows with a newer `updated_at`, full
  refresh every 5 min) and written atomically. `bridgeAt` says when the agent
  last confirmed them; the EA treats rules older than 120s as last-known.
* **Order and durability**: files are relayed oldest first; a transient failure
  stops that account's queue and backs off (4s → 60s), so nothing jumps ahead
  and nothing is lost across agent restarts or Supabase outages. A report that
  can never be accepted is moved to `tf_bridge/bad/` with a `.reason` file.
* **Untrusted volume**: every path is opened with `O_NOFOLLOW` relative to
  directory descriptors; symlinks, FIFOs and files over 64 KB are refused.

Desktop EAs are unaffected and keep calling the website.

## Enabling it

`TF_BRIDGE` in `/etc/tradeforce.env`: `off` (default), `all`, or comma-separated
account ids. It controls both the relay and whether newly provisioned terminals
get `BridgeMode=true` in `tf.set`. Existing terminals are switched with
`rollout-bridge.sh roll`, which verifies (EA in bridge mode, rules applied, a
relayed report newer than the restart, no backlog) and restores the previous EA
and preset automatically if any check fails within 20 minutes.

## Rolling back everything

Per account (automatic when `roll` fails, manual otherwise): restore
`TradeForce.ex5.bak-*`, `tf.set.bak-*` and `tf.set.preset.bak-*` in
`/srv/tf/<id>`, `docker restart tf-<id>`, remove the id from `TF_BRIDGE`,
`systemctl restart tf-agent`. Then, once no EA is in bridge mode,
`rollout-bridge.sh uninstall` puts agent v1.2 back.

An EA left in bridge mode with no agent serving it keeps enforcing its
last-known rules and keeps its reports on disk until an agent relays them.

## Brokers connected by server name (Exness)

MT5 accepts `Server=` as an address (`host:port`, works for any broker) or as a
server **name**, which works only if the terminal's `Config/servers.dat` already
knows it. Exness publishes no addresses and runs dozens of servers, so its
servers are connected by name, from a `servers.dat` seeded once:

1. Provision a throwaway volume from `tf-mt5:current` and start it (no login).
2. Tunnel its web desktop: `ssh -N -L 3000:<container-ip>:3000 root@<pool>`,
   open http://localhost:3000.
3. In MT5: File → Open an Account → search the broker → select it → Next →
   "Connect with an existing trade account" → open the Server list → Cancel.
   (Automating this with xdotool does not work: the wizard ignores synthetic
   input and captures show stale frames.)
4. Copy `Config/servers.dat` to `/root/docker-mt5/servers.dat`, rebuild the
   image; `provision.sh` copies it into every new volume. It decrypts in any
   volume made from the same baked prefix.
5. Verify by name with a fake login - `authorization on <Name> failed (Invalid
   account)` means MT5 resolved and reached it; a name it doesn't know just
   times out. Run checks one or a few at a time: several terminals unpacking at
   once time out and read as false negatives.

Seeded 22 Sep 2026 (Exness): servers.dat md5 336cebf3…, image
`tf-mt5:v127-exness`. Rollback: `docker tag tf-mt5:v127 tf-mt5:current`.

## The EA chart: TFCHART, not EURUSD

`[StartUp] Symbol=` must name a symbol the account can sync, or MT5 loads the
EA, waits five minutes and removes it ("initializing of TradeForce ... failed
with code 0 (symbol synchronization timeout)"). Brokers name EURUSD however
they like - Alpari's MT5 demo server has no plain EURUSD, Exness Standard uses
EURUSDm - so since agent 1.3.6 / image v128 every hosted chart opens on
**TFCHART**, a custom symbol that lives in the terminal:

- made once by `ea/TFChartSetup.mq5` (run as a `[StartUp] Script=` in a demo
  terminal; it calls TerminalClose so MT5 saves the definition),
- shipped as `/opt/tf/tfchart.tgz` = `Bases/symbols.custom.dat` +
  `Bases/Custom/history/TFCHART/`, unpacked by `provision.sh`.

EA v1.28 keeps one real broker symbol quoting on such a chart (EURUSD-like if
the broker has one) so `TimeCurrent()` - and the server-clock offset every day
boundary uses - keeps moving. Do not roll the image back below v128 while the
agent writes `Symbol=TFCHART`.

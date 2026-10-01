# Hosted terminals and funded (prop firm) accounts

What the cloud MT5 service actually is, what it means for a funded account, and
how to connect one without putting the trader's payout at risk.

Every number here was measured on the production pool server (`contabo-1`,
`169.58.141.233`) on 1–2 October 2026. Where something is unproven it says so.

---

## 1. What the service is

A trader gives us their MT5 login, password and server. We run **their** MetaTrader
terminal on our server, with our Expert Advisor attached, so the rules they set on
the dashboard are enforced whether or not their own computer is on.

It is not a copy service, a bridge to another broker, or a managed account. It is
one real terminal per trader, signed in as them, doing what their own terminal
would do.

---

## 2. How the hosting works

### 2.1 One box, many terminals

| Measured | Value |
| --- | --- |
| Host | 12 cores, 47 GB RAM, 96 GB disk (55% used) |
| Agent | `tf-agent` 1.6.0, systemd, capacity 30 |
| Terminals running | 11 |
| Per terminal | 1 Docker container, 1 GB memory cap |
| Image | `tf-mt5:ntsync` — Wine 11.0 built with ntsync, KasmVNC, openbox |
| Shared MetaTrader install | 2.8 GB, unpacked **once** |
| Per-trader disk | ~0.5–0.65 GB |

Each terminal is a container running a real Windows MetaTrader 5 under Wine. They
do not share a MetaTrader installation at runtime — each gets a private writable
view of one via overlayfs (`tf_prefixes.py`), which is why 11 terminals cost about
9 GB rather than 32 GB, and why a new trader is ready in seconds instead of after a
3 GB unpack.

### 2.2 How rules reach the EA

Hosted EAs make **no web requests**. Vercel's DDoS mitigation used to block the
pool server's address for 31 minutes at a time, which left hosted traders
unprotected, so rules travel through files instead:

```
EA  --writes-->  MQL5/Files/tf_bridge/out/<epoch>-<tick>-<seq>-<kind>.json  --agent-->  Supabase
EA  <--reads---  MQL5/Files/tf_bridge/in/config.json                        <--agent--  trading_rules
```

The agent polls `trading_rules` every 3 seconds and writes each account's rules
file atomically. The EA treats rules older than 120 seconds as last-known rather
than as "no rules", so a network problem never silently disables enforcement.

Verified live: all 11 rules files refresh about once a minute, and every account
produces **60 account snapshots per hour**.

### 2.3 Where the terminal connects

MetaTrader resolves `[Common] Server=` two ways, and the difference drives the
whole onboarding design:

| Form | Works? |
| --- | --- |
| `Server=mt5.broker.com:443` (an **address**) | Always, for any broker |
| `Server=FundedNext-Server3` (a **name**) | Only if that name is already inside the image's encrypted `Config/servers.dat` |

Our image's `servers.dat` knows almost nothing. Tested 1 Oct 2026 — all four
failed to open a connection at all:

```
ICMarketsSC-Demo          not reached   (and we connect to that exact server daily, by address)
Pepperstone-Demo          not reached
Tickmill-Demo             not reached
HFMarketsGlobal-Demo 4    not reached
```

**So every broker, including every prop firm, is connected by address.** Names are
not an option and cannot be made into one without a mechanism we do not currently
have (see §7.4).

---

## 3. What this means for a funded account

### 3.1 The address is not the problem

A broker's access point (`mt5.e8markets.com:443`) is a public network endpoint,
like a mail server hostname. It is not a secret, not account-specific, and every
trader at that firm uses the same one. Recording it in our broker list adds no new
data — `mt5_instances.mt5_server` already holds the address the trader typed in.

Harvesting an address from a connected terminal and listing it in the dropdown is
low risk and reuses data the trader already supplied for exactly this purpose.

### 3.2 The real exposure is whose terminal it is

"Does the firm allow EAs?" is necessary but **not sufficient**. Prop firm
agreements usually carry a separate clause about third-party access: sharing
credentials, letting someone else operate the account, or running it on
infrastructure the trader does not control. A firm can permit EAs enthusiastically
and still prohibit all three. Our service is squarely that: we hold the credentials
and run the terminal.

### 3.3 The shared IP is the sharpest practical hazard

Measured: **every container egresses from one address**, `169.58.141.233`.

```
host public IP          169.58.141.233
terminal container      169.58.141.233   (same)
containers sharing it   12
```

If three traders at the same firm connect through the pool, that firm sees three
funded accounts trading from a single IP. That is the standard signature for copy
trading and coordinated accounts, and prop firms actively police it. The
consequence lands on the **trader** — account closed, payout voided — and they
would have no idea the hosting caused it.

This is currently the single largest funded-account risk in the design, and it is
fixable (§5.3).

### 3.4 Already live

Four prop firms are in the dropdown and enabled today:

| Broker | Address |
| --- | --- |
| Alpha Capital | `mt5.alphacapitalgroup.uk:443` |
| E8 Markets | `mt5.e8markets.com:443` |
| Funded Trading Plus | `mt5.fundedtradingplus.com:443` |
| Maven Trading | `mt5.maventrading.com:443` |

So this is not a new direction. The question is whether it is being done knowingly.

---

## 4. How to connect a funded account today

### 4.1 Get the address

Prop firms publish a server *name* in the welcome email, almost never an address.
In order of reliability:

1. **Ask the firm's support** for "the MT5 access point, e.g. `mt5-demo.broker.com:443`". Slow, but it is the only source that is always right.
2. **A trader already connected** — their address is in `mt5_instances.mt5_server` and surfaces in the admin console under *Found from traders*, together with the server name their broker reported.
3. **Guess the hostname** — `/admin/brokers` → *Find a broker's servers*, which tries 15 conventional patterns against the firm's domain. Measured hit rate: roughly one real server per eight domains, so treat a miss as normal.

### 4.2 Prove it before trusting it

Reachability proves nothing — `mt5.roboforex.com:443` and `mt5.xm.com:443` both
accept TCP connections and neither is a MetaTrader server. The only honest test is
a real terminal with a login that was never valid:

```
"authorization on <addr> failed (Invalid account)"   -> a real MT5 server
"no connection to <addr>", or no attempt at all      -> a website, or nothing
```

That is what **Check it answers** runs in the admin console. It takes 2–4 minutes
on a pool box.

### 4.3 Catalogue it

Add the row at `/admin/brokers`. It appears in the trader's dropdown immediately,
with no deploy. One address serves **one server**, not one broker — a firm with
`Server1`, `Server2` and `Server3` needs three rows, and a trader on Server1
cannot use Server3's address (they are refused at login, which looks to them like
a wrong password).

---

## 5. The options, with trade-offs

### 5.1 Hosted pool terminal — what we do now

| Pros | Cons |
| --- | --- |
| Works with the trader's computer off | We hold the credentials — the clause most likely to be breached |
| Nothing for the trader to install | All traders share one egress IP (§3.3) |
| We control the EA version and can fix issues centrally | Terminal is ours, not the trader's — some firms prohibit outright |
| Near-instant provisioning (~0.5 GB/trader) | A firm that bans third-party hosting bans this, EA policy aside |

### 5.2 Trader runs the EA on their own MetaTrader

| Pros | Cons |
| --- | --- |
| No credential sharing, no third-party hosting, no shared IP | Only protects them while their PC is on and MetaTrader is open |
| Almost always within the firm's rules if EAs are allowed | They must install and update the EA themselves |
| Their own IP, as the firm expects | No protection from a phone, tablet, or another machine |

The safest option for a funded account, and the weakest protection.

### 5.3 Hosted terminal with a dedicated egress IP per account

| Pros | Cons |
| --- | --- |
| Removes the clearest compliance signal — each account looks like one trader | Still third-party hosting; does not fix §3.2 |
| Contained change to pool networking, not a redesign | Cost per IP, and some work in the agent |
| Lets several traders at one firm be served safely | Not built yet |

**Recommended if funded accounts become a real line of business.** Do it before
several traders at one firm are on the pool, not after one of them is closed.

### 5.4 The firm's own VPS, or a trader-rented VPS

| Pros | Cons |
| --- | --- |
| Explicitly sanctioned by many firms | We do not control it; support becomes hard |
| Trader's own IP and own machine | Trader pays, and must install the EA |
| Sidesteps both §3.2 and §3.3 | No central EA updates, no fleet visibility |

---

## 6. What to check per firm

Not the EA policy — these three clauses, which are the ones that actually bite:

1. **Third-party access / account sharing** — may anyone other than the trader hold credentials and operate the terminal?
2. **VPS and hosting** — allowed outright, allowed with disclosure, or restricted to the firm's own VPS?
3. **Multiple accounts from one IP** — how is it treated, and does disclosure change it?

This is a question about each firm's contract, not a technical one, and it should
be answered before the service is marketed for funded accounts. The four firms in
§3.4 are live today, so they are worth checking regardless.

---

## 7. Real limitations

### 7.1 Enforcement is reactive, not preventive

MQL5 gives an EA **no pre-broker veto** on a manual order. This is settled and
should not be re-litigated: the terminal cannot refuse a trade before it reaches
the broker. What the EA can do:

* delete pending orders while blocked, at no cost
* fix a missing or oversized stop loss by modifying the position
* close a position shortly after it fills
* close the terminal on a daily-loss breach (account is flat at that point)

For a funded account this matters: a rule violation is **corrected**, not
prevented, and a close-after-fill costs the spread. A firm's own hard breach
(daily drawdown) can still be hit by a single large fill before the EA reacts.

### 7.2 A hosted terminal does not stop phone trading

The trader can open their broker's mobile app and trade directly. The hosted EA
sees the fill afterwards and can close it, but cannot prevent it. Hosting removes
the "my PC was off" gap; it does not make the account tamper-proof.

### 7.3 One address is one server

Covered in §4.3. The dropdown grows one row per server, not one per firm.

### 7.4 Server names cannot currently be supported

Adding a broker to MetaTrader's own directory (so `Server=FundedNext-Server3`
works) requires its "Open an Account → Find your company" search. Driving that by
hand genuinely works — searching *Pepperstone* returns *Pepperstone EU Limited*
with its logo. But **it has never been shown to make a harvested name connectable**:
two tests with real server names failed afterwards, and the obvious success signal
is unreliable (`servers.dat` shifts by 72 bytes whether or not anything is found).
See the header of `infra/pool-agent/tf_search.py`. Until that is resolved,
addresses are the only mechanism.

### 7.5 Single pool server

One box, capacity 30, 11 in use. There is no second server and no automatic
failover: if `contabo-1` is lost, every hosted terminal is down until it is
restored.

### 7.6 Hosted EA version lags the repo

Hosted terminals run **EA 1.29**. The repo source is **1.31** (server-supplied
timezone offset). The hosted fleet needs a compile and roll to pick it up;
`infra/pool-agent/rollout-bridge.sh roll <account>…` does this one trader at a
time with automatic rollback.

---

## 8. Recommendation

1. **Read the three clauses in §6** for the four firms already in the dropdown. This is the only item that can retroactively harm a trader.
2. **Keep harvesting and cataloguing addresses** — that part is low risk and already works.
3. **Build per-account egress IPs (§5.3)** before onboarding several traders at the same firm.
4. **Offer §5.2 (their own MetaTrader) to traders whose firm prohibits third-party hosting** rather than declining them — weaker protection, but it keeps them inside their agreement.
5. **Say plainly in onboarding** that the terminal runs on our infrastructure, so a trader can check their own firm's rules before connecting.

---

*Measured on `contabo-1` 1–2 Oct 2026. Architecture details: `infra/pool-agent/README.md`.
Broker address mechanics: `src/lib/mt5-brokers.ts`. Search findings: `infra/pool-agent/tf_search.py`.*

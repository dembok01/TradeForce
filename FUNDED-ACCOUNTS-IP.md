# Funded accounts: removing the shared-identity problem

**Status:** measured and tested on the production pool box, 1 November 2026.
**Audience:** TradeForce stakeholders deciding how to host funded (prop firm) accounts.
**Companion document:** `FUNDED-ACCOUNTS.md` (the original assessment). This document
supersedes its §5.3.

---

## 1. Summary

Hosting several funded accounts on one server creates **two** signatures that a prop
firm can read as one person running many accounts. Only one of them was previously
identified.

| | Signature | Previously known | Cost to fix |
| --- | --- | --- | --- |
| 1 | Every terminal reports the **same machine identity** | No — found in this review | **£0** |
| 2 | Every terminal egresses from the **same IP address** | Yes (`FUNDED-ACCOUNTS.md` §3.3) | ~$2–4 per account per month |

**Recommendation: fix (1) immediately at no cost, apply two free policy measures,
and add (2) only for accounts at firms where a second trader is being onboarded.**

No additional server or VPS purchase is required for any step. The previously
recommended fix — buying extra IP addresses from the hosting provider — has been
tested and **does not work**; see §5.

---

## 2. Why this matters

Prop firms police account sharing and copy trading. The consequence of being flagged
falls on the **trader**: account closed and payout voided. They would have no way of
knowing the hosting caused it.

Industry guidance is consistent that hosting a terminal on a server is normally
tolerated, and that the problem is specifically a *shared* identity. One firm's terms
state plainly: *"We do not allow multiple users to operate accounts through the same
IP address."* Guidance for traders running multiple accounts summarises the position
as: a dedicated IP is fine, a shared one is the problem.

The risk is therefore not that we host terminals. It is that, today, two traders at
the same firm would be **indistinguishable from each other**.

---

## 3. Signature 1 — shared machine identity (the new finding)

### What we measured

All hosted terminals share one base installation, layered per trader to save disk.
That base carries the machine's identity, so every trader inherits it:

```
MachineGuid   1ee437cc-6606-4ad3-823f-8b119f6796a2     identical for all terminals
ProductId     12345-oem-0000001-54321                   identical for all terminals
InstallDate   20261028                                   identical for all terminals
common.ini    586 bytes, held in the shared base         identical for all terminals
```

### Why it matters

MetaTrader logins carry a **Computer ID (CID)** that the broker's server records. A
trader on the official MQL5 forum reports that *a trading firm found matching CID
values across accounts*, and MetaQuotes declined to explain publicly how the CID is
derived.

**What is confirmed:** our terminals are identical in every machine-identifying value
we can observe locally.
**What is not confirmed:** whether the broker-visible CID is derived from those values.

Given the consequence falls on the trader and the fix is free, the prudent course is
to stop relying on the assumption that it does not.

### The fix — free

Give each trader's terminal its own identity when it is first provisioned: generate a
fresh `MachineGuid`, and let MetaTrader regenerate `common.ini` rather than inheriting
the shared copy.

This became safe to do only recently. Provisioning currently preserves `common.ini`
because its encrypted section only decrypts against the original machine identity, and
that section holds the EA's web-request permissions. Since hosted EAs were moved to the
**file bridge**, they make no web requests at all, so that section is no longer used.
A change made for an unrelated reason has removed the obstacle.

**Effort:** a small change to one provisioning script, plus a test that a terminal still
signs in afterwards. **Cost: nothing.**

---

## 4. Signature 2 — shared IP address

Confirmed again on the current server: every terminal egresses from one address.

The fix is to send each funded account's connection out through its own address. We
tested whether MetaTrader can do this by itself, because if it can, nothing about the
server has to change — only a line in the per-trader configuration file the system
already writes.

### Test result: it can

Three terminals were started against a live broker, identical except for their proxy
settings, and the connection attempts were observed directly.

| Configuration | Result |
| --- | --- |
| No proxy settings | Connected straight to the broker |
| `ProxyEnable` + `ProxyAddress` | **Connected through the proxy** — confirmed in the terminal's own journal and by observing the incoming connection |
| `ProxyEnable` + `ProxyServer` | Failed to connect at all |

The terminal's journal recorded:

```
Proxy    connecting through SOCKS5 proxy 172.17.0.1:1080
```

and the connection arriving at our test endpoint began with a valid SOCKS5 handshake
offering **unauthenticated** access.

Three practical consequences:

1. The working setting is **`ProxyAddress`**, not `ProxyServer`. Published MetaQuotes
   documentation is correct here; a similarly-named value inside the program is not the
   one that works. Using the wrong name stops the terminal connecting entirely.
2. Because the terminal offers unauthenticated SOCKS5, we can use providers that
   authorise by **our server's IP address** instead of a username and password. This
   matters: the password field is stored in an encrypted form our system cannot
   generate, so password-based proxies would not be practical.
3. This is a **configuration-only** change. No change to server networking, no new
   software on the server, and it applies per account — accounts that do not need it
   are untouched.

### What it costs

Static ISP proxies with SOCKS5 and IP-based authorisation are roughly **$2–4 per
address per month**, depending on provider and volume. Indicative published rates at
the time of writing: Webshare ~$2.10/IP at volume, Oxylabs ~$3.20/IP, HydraProxy ~$4/IP,
Bright Data ~$0.90–1.30/IP on commitment. **Confirm the current rate and the SOCKS5 +
IP-authorisation combination at checkout**, as these vary by product tier.

Choose an address in the trader's own country, so the connection resembles a domestic
internet connection rather than a server.

**Port note:** residential proxy products often restrict traffic to ports 80 and 443.
This does not affect us — all four prop firms currently supported connect on port 443.
Only certain retail brokers use non-standard ports, and those accounts have no prop-firm
exposure, so they need no proxy.

---

## 5. Methods considered and rejected

| Method | Cost | Why not |
| --- | --- | --- |
| **Additional IP addresses from the hosting provider** | ~€2/month each | **Does not work.** All addresses the provider sells sit in the same network block and are registered to the same hosting company. Firms classify by network operator, not by individual address, so several accounts on several of these addresses still read as one hosting provider. This was the recommendation in `FUNDED-ACCOUNTS.md` §5.3 and should be withdrawn. |
| **IPv6 addresses** (one per terminal, free) | £0 | **Does not work.** None of the four supported prop firms accept IPv6 connections. |
| **Commercial VPN service** | ~$5/month | Exit addresses are shared by many customers and are widely classified as VPN endpoints — a worse signal than the problem being solved. |
| **Leasing and announcing our own address block** | $500+/month | Disproportionate, and the current hosting plan cannot announce customer address space. |
| **A separate small server per funded account** | ~$4/month each | Effective, but excluded: no additional server or VPS purchases. |

---

## 6. Recommended plan

**Step 1 — Give every terminal its own machine identity. Free. Do this first.**
Removes the strongest signature, benefits every account including existing ones, and
requires no purchase or ongoing cost.

**Step 2 — Until step 3 is in place, host at most one funded account per firm. Free.**
A placement rule, not a technical change. Two traders at *different* firms share an
address harmlessly, because neither firm can see the other's account.

**Step 3 — Confirm each firm's written position. Free, and the most important step.**
Ask each firm directly whether a third party may hold credentials and operate the
account on the trader's behalf. This is the only measure that addresses the question in
§7, and the answer determines whether we should host that trader at all.

**Step 4 — Add a per-account proxy address when onboarding a second trader at the
same firm.** ~$2–4 per account per month, configuration only, no new server.

---

## 7. What this does not solve

Everything above removes the risk of a trader being flagged for **copy trading they are
not doing**. That is a real and avoidable harm, and it is worth fixing.

It does **not** make hosting permitted where a firm's agreement forbids it. Prop firm
agreements commonly contain a clause about third-party access — sharing credentials,
letting someone else operate the account, or running it on infrastructure the trader
does not control. A firm can permit automated trading enthusiastically and still
prohibit all three, and our service is squarely that: we hold the credentials and run
the terminal.

Where a firm prohibits it, the correct answer is the option in `FUNDED-ACCOUNTS.md`
§5.2 — the trader runs the EA on their own MetaTrader. That is weaker protection,
because it only applies while their computer is on, but it keeps them inside their
agreement. Making hosted infrastructure harder to detect is not a substitute for
permission, and should not be treated as one.

This is consistent with the original assessment, which identified reading those clauses
as the only item that can retroactively harm a trader.

---

## 8. Appendix — verified configuration

Per-account settings, written into the terminal's startup configuration file:

```ini
[Common]
ProxyEnable=1
ProxyType=1                       ; 0 = SOCKS4, 1 = SOCKS5, 2 = HTTP
ProxyAddress=<host>:<port>        ; NOT "ProxyServer" - that name does not work
```

Verified behaviour:

- Honoured from the startup configuration file the system already writes per account.
- The terminal performs a standard SOCKS5 handshake and offers unauthenticated access,
  so IP-authorised proxies need no credentials.
- If the proxy is unreachable, the terminal retries about every 3 seconds and does
  **not** fall back to a direct connection. It fails closed, which is the safe
  behaviour, but it means a broken proxy stops that account trading until fixed —
  monitoring should treat a proxy failure as an outage.

**Measurement notes.** Machine identity values read from the shared base installation
on the production server. Proxy behaviour established by running three otherwise
identical terminals against a live broker address and observing both the terminal's own
journal and the inbound connections at a controlled endpoint. Prices are indicative
published rates and should be reconfirmed before purchase.

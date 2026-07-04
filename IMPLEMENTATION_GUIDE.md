# TradeForce — Implementation Guide

This is the working guide for TradeForce Phase 1: a prop-firm trading discipline
tool. This repo is a from-scratch build (see `../deltalytix/REPO_AUDIT.md` for why
the existing Deltalytix codebase was not used as a foundation — license and
domain-fit issues, not code quality). It ships the public landing page, the
full dashboard web app, the EA-facing API, and the MetaTrader 5 Expert Advisor
itself (`ea/TradeForce.mq5` — compile/install/test instructions in `ea/README.md`).

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16, App Router | Matches contract stack exactly |
| Auth + DB | Supabase (Postgres + Supabase Auth) | Matches contract stack exactly |
| ORM | None — `@supabase/supabase-js` directly | One less moving part; RLS does the access control Prisma would otherwise duplicate |
| Styling | Tailwind CSS v4 + hand-built shadcn-style primitives | CSS-variable token system, easy to re-theme |
| 3D | Three.js + React Three Fiber + drei | Landing page hero |
| Charts | Recharts | Daily/weekly/monthly P/L bars |
| Forms | Native `useActionState` + Server Actions | No client form-state library needed |
| Motion | `motion` (Framer Motion successor) | Nav drawers, ledger tick animation |

**FastAPI**: not present. Per the audit, this is orthogonal to the Phase 1
decision — a Python service for the EA is a from-scratch build no matter which
Next.js foundation was chosen, since none of the JS ecosystem transfers into it.
Phase 1 ships the EA-facing contract as Next.js Route Handlers instead
(`app/api/ea/*`) so there's a working, deployed stub immediately; Phase 2 can
either keep extending those routes or stand up a separate FastAPI service that
calls the same Supabase project — the database schema and RLS model don't care
which language issues the queries.

## 2. Design system — "the ledger"

Named palette (also documented inline in `src/app/globals.css`):

| Token | Hex | Use |
|---|---|---|
| Obsidian | `#0A0908` | Background |
| Graphite | `#141210` | Card/surface |
| Bone | `#EDE8DE` | Foreground text |
| Ash | `#8C8577` | Muted text |
| Bullion Gold | `#D9B65C` | Primary accent — spent deliberately, not everywhere |
| Antique Bronze | `#8A6A2F` | Secondary gold, gradients, chart-5 |
| Signal Red | `#C0392B` | Violations/breaches only — never decorative |

Typography is a 3-tier system, each with a job:
- **Fraunces** (display serif) — headings only, used with restraint
- **Inter** (body) — everything else
- **IBM Plex Mono** (`--font-mono`) — numbers, timestamps, labels, ledger rows. This is deliberate: it signals "this value is measured/logged," tying directly to the product's own subject matter.

The signature element is the **ledger row** (`.ledger-row` in `globals.css`) — a
hairline-bordered list row used for the hero's live rule list, the landing
page's "Charter" feature list, and the auth-page sidebar. It's a real
document/manifest metaphor, not a decorative bento grid, because TradeForce's
actual product is a set of enforced rules — the layout says that before any
copy does.

Chart colors follow the `dataviz` skill's method: gain/loss bars use the
validated success/destructive pair (`references/palette.md` process, not
eyeballed — see the `node scripts/validate_palette.js` run in the build history
if you need to re-verify after a palette change). The discipline-score gauge is
a **meter**, not a categorical chart — same-ramp track with a status-colored
fill (destructive <50, warning 50–74, success ≥75), always paired with a text
label, never color alone.

## 3. Data model

See `supabase/migrations/20260702000000_init_schema.sql` for the full DDL. Every
user-owned table denormalizes `user_id` directly (rather than requiring a join
through `accounts`) so RLS policies stay simple `auth.uid() = user_id` checks.

```
profiles          — 1:1 with auth.users, auto-created via trigger on signup
accounts          — a trading account; Phase 1 = one per user (is_primary)
trading_rules     — 1:1 with accounts; both Rule Settings and Session Control
                     pages write to this single row (different column subsets)
trades            — journal entries; source: MANUAL | EA (manual entry locks
                     while an EA has reported within 24h — see src/lib/ea-connection.ts)
violations        — breach log; written by the EA via POST /api/ea/violations
discipline_scores — one row per account per day; a daily cron persists rows
                     (api/cron/discipline-scores), with a live estimate from
                     violations as the fallback when no row exists (see §5)
account_snapshots — append-only equity history, written by POST /api/ea/account
                     alongside the in-place accounts update (equity-curve source)
api_keys          — hashed EA credentials, issued on Rule Settings and consumed
                     by the EA; last_used_at doubles as the "EA connected" signal
contact_messages  — landing page enquiry form, insert-only from anon
```

All tables have RLS enabled with owner-only policies. `contact_messages` is the
one exception (public insert, no public select — messages are only readable via
the Supabase dashboard or a future admin view with `service_role`).

## 4. Page-by-page spec

### Landing (`/`)
- `components/marketing/hero.tsx` — the ledger (5 enforced rule types, ticking)
  + headline + `HeroScene` (R3F "governor" ring, `components/three/`)
- `components/marketing/charter-features.tsx` — 6 provisions (I–VI), one per
  Phase 1 dashboard section
- `components/marketing/pricing.tsx` — 2 tiers, static copy (no Stripe in Phase 1 — CTA links to `/signup`)
- `components/marketing/contact.tsx` — real form, `submitEnquiryAction` inserts
  into `contact_messages` (no email service wired; read submissions via the
  Supabase table editor, or add Resend later)
- Mobile-responsive throughout — check `nav.tsx`'s drawer breakpoint at `lg:`

### Auth (`/login`, `/signup`, `/reset-password`, `/update-password`)
- All four wired to real Supabase Auth calls in `src/lib/actions/auth.ts`
- `src/app/auth/callback/route.ts` handles the email-link exchange for both
  signup confirmation and password recovery
- `src/lib/supabase/middleware.ts` gates every `/dashboard/*` route and
  redirects signed-in users away from `/login` and `/signup`

### Dashboard home (`/dashboard`)
- 7 stat tiles (`components/dashboard/stat-tile.tsx`), each with a real empty
  state — this was a named Phase 1 requirement since there's no EA yet
- Discipline score gauge (compact) with a link to the full breakdown
- Data: `src/lib/data/dashboard.ts` — `getDashboardOverview()`

### Trading Plan Status (`/dashboard/trading-plan`)
- 3 progress meters (daily loss, trades/day, open positions) + session list
  with live active/closed state, computed from `src/lib/trading-sessions.ts`
- Data: `src/lib/data/trading-plan.ts` — `getTradingPlanStatus()`

### Session Control (`/dashboard/sessions`)
- Toggles for London/NY/Asian/overlap, custom hour range, timezone select
- `updateSessionConfigAction` in `src/lib/actions/trading-rules.ts`

### Violation Centre (`/dashboard/violations`)
- Recent 50 violations table + week/month counts + full discipline-score
  breakdown (gauge + 4 factor meters)
- Data: `src/lib/data/violations.ts`, `src/lib/data/discipline.ts`

### Trade Journal (`/dashboard/journal`)
- Table (Symbol/Direction/Entry/Exit/P&L/Date-Time), inline autosaving notes
  field, date-range filter (URL-driven), manual "Log trade" dialog
- Manual entry locks while the EA is live (last report < 24h,
  `src/lib/ea-connection.ts`) so the record stays verified; EA rows show a
  badge instead of a delete button and can never be deleted (enforced in the
  server action too, not just the UI). Notes stay editable on every row.
- Data/actions: `src/lib/data/trades.ts`, `src/lib/actions/trades.ts`

### Analytics (`/dashboard/analytics`)
- Win rate, trades this week/month, 3 P/L bar charts (7d/8wk/6mo)
- Data: `src/lib/data/analytics.ts`; chart: `components/dashboard/pnl-bar-chart.tsx`

### EA Setup (`/dashboard/ea-setup`)
- Connection badge (Connected / Last seen / Never connected, from
  `api_keys.last_used_at` via `getEaConnection()`) + the 5-step install guide
  (download → MQL5/Experts → WebRequest whitelist → API key → AutoTrading)
- The download button serves `public/downloads/TradeForce.ex5` — the compiled
  binary is committed there; recompile and replace it when the EA source
  changes (see `ea/README.md`)

### Rule Settings (`/dashboard/settings`)
- Daily loss limit, max trades/day, max open positions, risk-per-trade %,
  active toggle — `updateRuleSettingsAction`
- EA API key issuance (generate/revoke, key shown once, stored as a SHA-256
  hash) — `src/lib/actions/api-keys.ts`, `src/lib/ea-auth.ts`

### EA-facing API (`/api/ea/*`)
Bearer-token auth (`Authorization: Bearer tf_live_...`), verified against the
hashed `api_keys` table via a service-role client (`src/lib/supabase/service.ts`
— **server-only, never import into client code**), with per-key fixed-window
rate limiting (120/min, `src/lib/rate-limit.ts` — per-instance, see §5):
- `GET /api/ea/config` — full rule config incl. `configVersion`, the 60-second poll target
- `GET /api/ea/ping` — just `configVersion`; cheap enough to hit every few seconds,
  re-fetch config only when it changes (the force-sync path — a DB trigger bumps
  `trading_rules.config_version` on every dashboard save)
- `POST /api/ea/trades` — trade report ingestion (zod-validated, schema shared
  with the manual dialog in `src/lib/schemas/trade.ts`)
- `POST /api/ea/violations` — breach reports; feeds the Violation Centre and
  discipline score
- `POST /api/ea/account` — equity/balance update + append-only `account_snapshots` row

The caller is `ea/TradeForce.mq5` — the MetaTrader 5 Expert Advisor. It pings
every 5s, re-fetches config on a `configVersion` change, enforces all five
rules close-on-violation in `OnTradeTransaction` (plus a timer-driven daily-loss
kill switch), and reports closed deals, violations, and equity snapshots back.
Its daily reset mirrors the web app's timezone semantics (IST/UTC/New-York with
US DST). Compile/install/per-rule test checklist: `ea/README.md`.

The endpoints can also be tested directly with `curl` once you have a key from
the Rule Settings page:

```bash
curl -H "Authorization: Bearer tf_live_..." https://your-deploy/api/ea/config
```

## 5. Known Phase 1 simplifications (intentional, documented so Phase 2 doesn't rediscover them the hard way)

- **Discipline score**: `/api/cron/discipline-scores` (Vercel Cron, `vercel.json`,
  authorized by `CRON_SECRET`) persists one row per account per day.
  `getDisciplineScore()` still derives a live estimate from the last 30 days of
  `violations` when today's row doesn't exist yet (e.g. before the first cron
  run), and prefers the persisted row when it does.
- **Timezones**: all daily/weekly/monthly boundaries go through
  `src/lib/time-boundaries.ts` using the account's `trading_rules.timezone`
  (fallback `profiles.timezone`, then UTC) — "today" rolls over at the trader's
  midnight, not the server's.
- **Session windows**: `src/lib/trading-sessions.ts` uses fixed approximate
  UTC hours for London/NY/Asian, no DST handling. Fine for a status indicator;
  revisit with a proper timezone library if session precision becomes load-bearing.
- **Open positions**: computed as `trades` rows with `exit_time IS NULL`,
  regardless of entry date. Correct semantically, but Phase 1 has no live feed
  to keep it accurate in real time — it's only as fresh as the last manual entry.
- **API key security**: SHA-256-hashed (unsalted by design — 192-bit random
  keys, and the unique-index lookup needs a deterministic hash) and shown once.
  Per-key rate limiting is in-memory/per-instance (`src/lib/rate-limit.ts`) —
  a guard against runaway EA loops, not a global quota; swap in a shared store
  (e.g. Upstash Ratelimit) if a real fleet needs one. No key scoping or expiry
  yet.

## 6. Setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase project URL + keys
```

In the Supabase SQL editor (or via `supabase db push` if you link the CLI), run
the migrations in `supabase/migrations/` in filename order — all three:
`20260702000000_init_schema.sql`, `20260703000000_onboarding.sql`,
`20260704000000_phase2_backend.sql`. Set `CRON_SECRET` in the deploy environment
so the Vercel cron (`vercel.json`) can authenticate against
`/api/cron/discipline-scores`. Then:

```bash
npm run dev
```

`npm run build && npm run start` for a production check before deploying (Vercel
is the obvious target given the stack — no server-specific code was written).

## 7. What's explicitly out of scope (per contract)

Weekly loss tracking, max lot size, symbol allow/block lists, consecutive-loss
lock, revenge-trading protection, cooldown timers, news blackout, "money saved"
counter, profit-factor/R:R analytics, mentor/multi-account dashboards, in-app
payments, mobile apps, other broker integrations, AI trade analysis. Don't add
these without a scope conversation — they're not free even if they look small.

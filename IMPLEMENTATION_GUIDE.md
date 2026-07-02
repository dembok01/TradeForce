# TradeForce — Implementation Guide

This is the working guide for TradeForce Phase 1: a prop-firm trading discipline
tool. This repo is a from-scratch build (see `../deltalytix/REPO_AUDIT.md` for why
the existing Deltalytix codebase was not used as a foundation — license and
domain-fit issues, not code quality). It ships the public landing page and the
full dashboard web app, with the backend shaped so Phase 2's EA integration is
additive rather than a rewrite.

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
trades            — journal entries; source: MANUAL (Phase 1) | EA (Phase 2)
violations        — breach log; empty until Phase 2's EA reports them
discipline_scores — one row per account per day; Phase 1 computes an estimate
                     live from violations if no row exists yet (see §5)
api_keys          — hashed EA credentials; issuance UI ships in Phase 1,
                     nothing consumes them until Phase 2
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
- Data/actions: `src/lib/data/trades.ts`, `src/lib/actions/trades.ts`

### Analytics (`/dashboard/analytics`)
- Win rate, trades this week/month, 3 P/L bar charts (7d/8wk/6mo)
- Data: `src/lib/data/analytics.ts`; chart: `components/dashboard/pnl-bar-chart.tsx`

### Rule Settings (`/dashboard/settings`)
- Daily loss limit, max trades/day, max open positions, risk-per-trade %,
  active toggle — `updateRuleSettingsAction`
- EA API key issuance (generate/revoke, key shown once, stored as a SHA-256
  hash) — `src/lib/actions/api-keys.ts`, `src/lib/ea-auth.ts`

### EA-facing stub API (`/api/ea/*`)
Bearer-token auth (`Authorization: Bearer tf_live_...`), verified against the
hashed `api_keys` table via a service-role client (`src/lib/supabase/service.ts`
— **server-only, never import into client code**):
- `GET /api/ea/config` — rule config, the Phase 2 60-second poll target
- `POST /api/ea/trades` — trade report ingestion (zod-validated)
- `POST /api/ea/account` — equity/balance update

These are real, working, deployed endpoints today — just with no EA calling
them yet. Test them with `curl` once you have a key from the Rule Settings page:

```bash
curl -H "Authorization: Bearer tf_live_..." https://your-deploy/api/ea/config
```

## 5. Known Phase 1 simplifications (intentional, documented so Phase 2 doesn't rediscover them the hard way)

- **Discipline score**: no cron computes `discipline_scores` daily yet, since
  nothing feeds it in Phase 1. `getDisciplineScore()` derives a live estimate
  from the last 30 days of `violations` on every read instead. Add a daily
  scheduled function (Supabase Cron or a Vercel Cron route) in Phase 2 that
  writes a real row per account per day; the read path already prefers a
  persisted row over the estimate, so no dashboard code changes when you do.
- **Session windows**: `src/lib/trading-sessions.ts` uses fixed approximate
  UTC hours for London/NY/Asian, no DST handling. Fine for a status indicator;
  revisit with a proper timezone library if session precision becomes load-bearing.
- **Open positions**: computed as `trades` rows with `exit_time IS NULL`,
  regardless of entry date. Correct semantically, but Phase 1 has no live feed
  to keep it accurate in real time — it's only as fresh as the last manual entry.
- **API key security**: hashed (SHA-256) and shown once, but no scoping,
  expiry, or rate limiting yet. Harden before a real EA depends on it in
  production — this was flagged in the original repo audit as the one thing
  worth tightening before Phase 2 goes live.

## 6. Setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase project URL + keys
```

In the Supabase SQL editor (or via `supabase db push` if you link the CLI), run
`supabase/migrations/20260702000000_init_schema.sql`. Then:

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

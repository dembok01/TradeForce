# TradeForce

A trader discipline and risk-enforcement platform for prop-firm traders: set a
charter of trading rules on the web dashboard, and (Phase 2) a MetaTrader
Expert Advisor enforces them in the terminal and reports trades, violations,
and equity back.

**Read [`IMPLEMENTATION_GUIDE.md`](./IMPLEMENTATION_GUIDE.md) first** — it is
the real documentation: stack decisions, data model, page-by-page spec, and the
intentional Phase 1 simplifications.

## Quick start

```bash
npm install
cp .env.example .env.local   # Supabase URL + anon + service-role keys
```

Apply every file in `supabase/migrations/` (in filename order) via the Supabase
SQL editor, or `supabase db push` if the CLI is linked to the owning project.
`src/lib/supabase/database.types.ts` is hand-written and must be updated in
lockstep with any migration.

```bash
npm run dev    # local dev
npm run test   # vitest unit tests (~70s)
npm run build  # production build (slow — several minutes on modest hardware)
```

End-to-end smoke test (real browser + real Supabase; needs a running dev
server): `node .claude/skills/run-tradeforce/driver.mjs smoke`

## Environment variables

| Variable | Use |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + RLS-scoped server reads |
| `SUPABASE_SERVICE_ROLE_KEY` | EA routes and cron only (`src/lib/supabase/service.ts`, server-only) |
| `CRON_SECRET` | Authorizes `/api/cron/*` (Vercel sends it as a Bearer token automatically) |

## Layout

- `src/app/` — marketing site (`/`), auth pages, `dashboard/*`, and the
  Bearer-authenticated EA API under `app/api/ea/*` (config, ping, trades,
  violations, account).
- `src/lib/data/` — server-component read layer (RLS-scoped, throws on error);
  `src/lib/actions/` — server-action mutations; `src/lib/schemas/` — zod.
- `supabase/migrations/` — the schema; RLS owner-only on every table.

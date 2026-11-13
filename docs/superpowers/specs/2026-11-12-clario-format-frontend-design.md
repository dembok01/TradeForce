# TradeForce frontend rework — Clario format, TradeForce colours

**Date:** 2026-11-12
**Status:** awaiting approval
**Reference:** https://clario.framer.website/#home

---

## Intent and why

The client sent `clario.framer.website` as a sample and asked for the TradeForce
frontend to be reworked into that same style and format, with the existing
colours untouched, keeping whatever is strongest in the current build.

The current marketing site is an *editorial* design — a legal-charter metaphor
rendered in hairline rules, Roman numerals, a serif display face and square
corners. It is coherent and unusual, but it reads as a document, not as a
product. Clario reads as a modern SaaS product page: it shows the thing,
repeatedly, in large soft-cornered cards, and it sells with structure (steps,
bento, comparison, proof, FAQ) rather than with prose.

The client wants the second thing. The gold-on-obsidian palette is the part of
the TradeForce identity that stays; the typographic and structural grammar is
the part that changes.

All design decisions were delegated by the client ("decide and choose everything
that is better"). Everything in the **Decisions** section below is therefore
*my call*, not something the client agreed to, and is open to correction.

---

## Goals

1. The landing page reads unmistakably as the Clario grammar — same section run,
   same card language, same type treatment, same motion feel.
2. TradeForce's palette survives exactly. Gold takes over every structural job
   Clario gives its lime accent.
3. The dashboard benefits too. The shared token and primitive layer carries the
   new language into the authenticated app, so the product stops looking like a
   different design from the site that sells it.
4. The three genuinely distinctive things the current build has are kept, not
   discarded for template parts.

## Non-goals

- No backend, data-layer, EA-API or auth changes. This is presentation only.
- No CMS. No blog infrastructure.
- Not an information-architecture rewrite of the dashboard — the routes, the
  data each page shows, and the flows stay as they are.
- Not a change to the admin area beyond what it inherits from shared tokens.

## Anti-goals — these would make it a failure even if it shipped

- **Fabricated social proof.** Invented testimonials with invented names and job
  titles on a real commercial product. Clario's testimonial marquee is filled
  with template filler; copying the *shape* is fine, copying the *practice* is
  not.
- A page that looks like every other dark SaaS template and loses the one
  argument TradeForce actually has — that it stops the trade in the terminal,
  before the damage, not in a journal afterwards.
- The dashboard left stranded in the old visual language while the marketing
  site moves on.
- Palette drift. Any lime, any pure white, any cool grey creeping in from the
  reference.

---

## Constraints

- Next.js 16.2.10, App Router, React 19.2.4.
- Tailwind v4, `@theme inline` token bridge in `src/app/globals.css`.
- `motion` v12 is already the animation library; Radix primitives are already
  the interaction layer. Use them, add nothing new.
- `AGENTS.md` is binding: this Next.js differs from training data. Read the
  relevant guide under `node_modules/next/dist/docs/` before writing code —
  particularly for fonts and CSS handling.
- `@react-three/fiber`, `drei` and `three` are already installed and carry real
  bundle weight. They are a sunk cost worth using, not worth expanding.
- `public/` contains **no product screenshots** — only framework SVG leftovers.
  Any "product shot" must be composed, not sourced.
- `~5,300` lines of existing component code across dashboard, admin, ui and
  marketing. The dashboard surface is large (33 components); reaching it through
  shared tokens is the only proportionate way.

---

## What the reference actually is

Measured off the live page rather than eyeballed:

| | Clario | TradeForce today |
|---|---|---|
| Ground | `#050505` | `#0A0908` obsidian |
| Card | `#0D0D0D` | `#141210` graphite |
| Accent | `#8CFF2E` lime | `#D9B65C` bullion gold |
| Text | pure white | `#EDE8DE` bone |
| Family | Manrope, single family | Fraunces + Inter + Plex Mono |
| Display weight | 500 | 600/700 |
| Tracking | −0.04em | −0.01em |
| h1 | 64px / 1.0 line | 60px / 1.08 |
| h2 | 48px / 1.2 line | 36px / 1.1 |
| Radius | 30px panel, 20px card, 12px tile, full pills | 8px everywhere |
| Eyebrow | accent pill | uppercase mono, letterspaced |

The palettes are already structurally the same design — near-black ground, one
raised surface a few points lighter, a single saturated accent. That is why
"keep the colours, change the format" is coherent rather than contradictory:
only the hue of the accent and the warmth of the text differ, and both are
TradeForce's to keep.

The real distance is **shape and type**, and that is what this rework changes.

---

## Decisions

### 1. Colour — no change at all

Every token value in `:root` stays as it is. Gold `hsl(42 62% 58%)` simply
inherits every structural job Clario hands to lime:

- eyebrow pills (accent text, accent border at ~30% alpha)
- the primary CTA fill, with an outer glow
- icon glyphs inside feature tiles
- the radial bloom behind the hero frame
- active/selected states

Bone `#EDE8DE` is kept for text rather than moving to Clario's pure white — the
warm text is half of what makes the palette read as gold rather than yellow.

Signal red stays reserved for violations only, as it is today.

### 2. Typography — Fraunces retires, Manrope takes over

Clario's single-family discipline is most of its look. Adopting it:

- `--font-sans` → **Manrope** (replaces Inter)
- `--font-display` → **Manrope** (replaces Fraunces)
- `--font-mono` → **IBM Plex Mono, retained but demoted**

The mono face stays because this is a trading product and tabular numerals are
functional, not decorative: P/L columns, timestamps, API keys, account numbers.
It is removed from every *decorative* use — the uppercase letterspaced eyebrows
throughout the marketing site and `page-header.tsx` become Clario-style pills.

Scale, matching the reference, fluid down to mobile:

| Role | Size | Line | Tracking | Weight |
|---|---|---|---|---|
| h1 | 64px | 1.0 | −0.04em | 500 |
| h2 | 48px | 1.2 | −0.04em | 500 |
| h3 | 34px | 1.3 | −0.04em | 500 |
| body | 16–18px | 1.6 | normal | 400 |

The `.text-gradient-gold` treatment survives — it is the one flourish that is
TradeForce's own and has no Clario equivalent to displace it. Used on one word
per page, as now.

### 3. Shape — the radius scale goes up

This is the single most visible format change. `--radius` moves from `0.5rem`
to a scale:

```
--radius-tile:  0.75rem   /* 12px — icon tiles */
--radius:       1.25rem   /* 20px — cards, the default */
--radius-panel: 1.875rem  /* 30px — hero frame, large panels */
```

Buttons become full pills. `.border-gold-glow` is extended into a reusable glow
used on the primary CTA and the hero frame.

`.ledger-row` — the hairline rule — is **retired from the marketing site**,
where it is the thing most at odds with the reference. It is **kept in the
dashboard** for tables (`trade-table`, `violations-table`, `ledger-table`),
where hairline density genuinely beats cards.

That line is not clean, because `FeedRowView` hard-codes `.ledger-row` and is
shared by the dashboard feed, the landing page's live demo and the hero frame.
The rule that resolves it: **hairlines are allowed inside anything that depicts
the product UI.** A frame showing the dashboard should look like the dashboard.
So `FeedRowView` is left alone — not parameterised, not forked — and the
retirement applies to the marketing site's *own* chrome: the charter rows, the
hero ledger, the pricing and contact sections.

#### The derived radius chain

`@theme inline` currently derives `--radius-sm/md/lg/xl` from `--radius` by
`calc()`. Moving the default to `1.25rem` would silently drag every
`rounded-md` (20 uses), `rounded-lg` (18) and `rounded-xl` (15) across the
dashboard, admin and the Radix primitives up with it — making inputs, selects,
sheets and the Sonner toast 18–24px. That is not wanted: Clario rounds *cards*
hard and keeps *controls* tighter.

So the chain is **decoupled**. `--radius-sm/md/lg` stay anchored near today's
values for form controls and overlays; `--radius` (20px), `--radius-tile` (12px)
and `--radius-panel` (30px) are the new explicit card tokens. Inputs, selects,
dialogs and toasts land at tile scale, not card scale. This is a per-primitive
remap plus a sweep of hard-coded `rounded-*` classes, not a one-token edit, and
the plan should budget for that.

### 4. Section run for the landing page

Clario's order, with TradeForce content:

| # | Section | Content |
|---|---|---|
| 1 | Nav | logo left, centred links, dark pill "Sign in" + gold glow pill "Start free" |
| 2 | Hero | eyebrow pill, 64px headline, sub, two CTAs, product frame with gold bloom |
| 3 | How it works | 3 steps — connect the account, set the charter, let it enforce |
| 4 | Bento | 4 cards: discipline score, governor ring (rule enforcement), violation centre, session control |
| 5 | Stat strip | headline numbers |
| 6 | Features | the six charter provisions as icon cards |
| 7 | Comparison | journals / spreadsheets / willpower vs TradeForce |
| 8 | Proof | the live enforcement demo |
| 9 | Pricing | existing two plans, POPULAR badge, no toggle |
| 10 | FAQ | numbered accordion, 01–06 |
| 11 | Contact | the existing enquiry form, restyled |
| 12 | Closing CTA | full-width band |
| 13 | Footer | three columns |

The enforcement feed appears **twice**, not three times: composed in the hero
frame (#2) and as the proof section (#8). An earlier draft of this document also
gave it a bento cell, which would have shown the same component three times on
one page. The bento's rule-enforcement cell is the governor ring instead.

**Deviations from the reference, and why:**

- **Blog grid (Clario #11) — built, ships hidden.** There is no blog, no CMS and
  no posts. The section is built and renders from a `POSTS` array that ships
  empty; an empty array renders nothing. The format is there the moment there is
  content, and the live site never shows a link to a post that does not exist.
- **Testimonial marquee (Clario #8) — built, ships hidden, same mechanism.**
  Covered under anti-goals: I will not write fake customer quotes. The marquee
  component and its layout are built and driven by a `TESTIMONIALS` array that
  ships empty. The moment the client supplies real quotes it renders. In the
  meantime slot #8 carries the live enforcement demo, which is stronger proof
  than a testimonial anyway.
- **Monthly/yearly pricing toggle (Clario #9) — dropped.** *Client decision,
  2026-11-12.* There is no yearly price, and no Stripe at all — both pricing
  CTAs link to `/signup` (`IMPLEMENTATION_GUIDE.md:101`). A toggle implying an
  annual discount that cannot be charged is an invented commercial term, which
  is the testimonial problem in a different section. The plans keep Clario's
  card layout and POPULAR badge without it.
- **Contact section — added, and not in the reference's run.** Clario has no
  contact form. `contact.tsx` is a working server action writing to
  `contact_messages`, which is the admin inbox (`src/lib/data/admin.ts:352`)
  and the channel cloud-EA requests arrive on (`src/lib/actions/cloud-ea.ts:209`);
  nav and footer both link to `#contact`. Deleting it would remove the only
  public inbound channel and starve an admin page — that is not a presentation
  change, so it stays, restyled, as #11.

### 5. The hero visual — composed and live, not a screenshot

Clario's hero centres on a large static dashboard image in a 30px frame with a
lime bloom behind it. TradeForce has no such image.

Rather than commission one, the hero frame is **composed** to look like the
dashboard, inside the 30px frame with the gold bloom. This needs no asset
pipeline and cannot go stale the way a screenshot does.

**How far that composition may reach into dashboard code — my call:** it reuses
only the pieces that are already presentational and client-safe, `FeedRowView`
being the clear one. Where a dashboard component is coupled to a provider or to
its own layout chrome — `EnforcementFeed` needs `useTimezone()`, `TodayStrip`
takes `timezone`/`status`/`sessions` and renders its own `mb-6` and lock-state
chrome, and both are tuned for a full-width column rather than a hero frame —
the marketing side gets its own small composition instead. **No dashboard
component is refactored to accept marketing-shaped props**, which would push
presentation concerns into the product for a landing-page need and violate the
"feature behaviour is untouched" non-goal.

The frame is **near-static**: a composed snapshot with one slow pulse on the
live indicator. It does not run a second scripted feed — the proof section (#8)
owns that animation, and duplicating it would halve the impact of both. This
also keeps the hero's LCP element server-renderable.

### 6. The three keepers

The client asked to keep what is best. These are it:

- **The live enforcement feed** (`live-demo.tsx`) — "watch trade #6 not happen".
  This is the entire product argument in eight rows and it is the best thing on
  the current site. Promoted into the proof slot (#8).
- **The 3D governor ring** (`three/`) — relocated out of the hero, where Clario's
  grammar wants the product frame, and into the bento grid (#4) as the
  rule-enforcement card. It keeps its distinctiveness and stops competing with
  the product shot. `GovernorScene` is pointer-reactive inside an
  `aspect-square` wrapper, so it takes the bento's **square cell**, and the
  other three cards' spans are tuned around that rather than the reverse.
- **The six charter provisions** — content kept verbatim; presentation changes
  from hairline rows with Roman numerals to Clario's icon-card grid.

### 7. The dashboard

Reached primarily through the shared layer, which is the proportionate approach
for 33 components:

- `globals.css` tokens — type, radius scale, glow utilities
- `layout.tsx` — font swap
- `ui/` primitives — `button` (pills), `card` (20px), `badge`, `input`,
  `textarea`, `select`

Plus targeted passes where the old language is hard-coded rather than tokenised:

- `sidebar.tsx` — nav items to pill shapes
- `page-header.tsx` — mono eyebrow to accent pill
- `stat-tile.tsx` — radius, type scale, mono demoted to the value only

Tables keep their hairlines. Feature behaviour is untouched.

### 8. The auth pages — in scope

`src/components/auth/auth-shell.tsx` is a marketing-grade split screen behind
`/login`, `/signup`, `/reset-password` and `/update-password`, and it hard-codes
precisely the grammar being retired: the "Live enforcement ledger" `.ledger-row`
list with zero-padded numerals, the Fraunces display face, the mono letterspaced
eyebrow. Tokens alone will not fix it, because the ledger list *is* the layout.

It is in scope. This is the screen immediately behind the hero's "Start free"
pill, so leaving it is the stranded-language anti-goal landing in the middle of
the conversion flow. It is rebuilt to the new grammar, and the plan should carry
it as real work rather than assume it inherits.

---

## Open — the client's call, not mine

1. **Testimonials.** Needs real quotes with real attribution. The section ships
   hidden until they exist.
2. **Stat-strip numbers.** Clario uses "3k+ freelancers / $1.2M+ saved". The
   equivalent — accounts protected, violations blocked, payouts saved — must be
   real figures or the strip should be dropped. Ships hidden pending numbers.
3. **FAQ answers that make commercial claims.** *Settled 2026-11-12: I draft all
   six from what the repo documents actually support, and flag the
   claims-bearing ones for sign-off before they ship.* The live wire here is
   compatibility: `FUNDED-ACCOUNTS.md` records that Maven bans EAs outright and
   three other firms require written approval, so any answer implying
   "works with any funded account" would be false. Support response times and
   refund terms have no source in the repo at all and will be drafted as
   deliberately unspecific until the client fixes them.

### Copy for the new sections

Sections 3, 5, 7, 10 and 12 have no copy in the repo. I draft all of it from
`README.md`, `IMPLEMENTATION_GUIDE.md`, `FUNDED-ACCOUNTS.md` and the existing
marketing components, which between them describe the product accurately. Two
constraints on that drafting, carried from the anti-goals: nothing asserts a
capability the code does not have, and nothing asserts a commercial term
(price, SLA, refund, firm compatibility) that no document supports.

---

## Left to the builder

- Motion curves and durations. Follow the reference's feel: ~0.5s ease-out,
  40–60px rise on entry, 60ms stagger between siblings. `reveal.tsx` and
  `stagger.tsx` already exist and should be extended rather than replaced.
  The existing `prefers-reduced-motion` block in `globals.css` must keep working.
- Responsive breakpoints per section. The reference is desktop-first; every
  section needs a deliberate mobile form, not a squeezed one.
- Icon selection from `lucide-react` (already a dependency).
- Whether the Manrope weight set needs 400/500/600 or only 500 once the scale
  is in.
- Verification: `npm run build`, `npm run lint`, `npm test` all green before
  the work is called done. Note that this bar is **cheap to clear and proves
  little here**: `vitest.config.ts` runs Node-environment unit tests over
  `src/**/*.test.ts` only, with no component or visual tests, so nothing in the
  suite pins markup. A redesign that breaks every page visually would still go
  green. The real check is running the app and looking at each route — landing,
  the four auth pages, and the dashboard pages that inherit the token change.

# Clario-Format Frontend Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the TradeForce frontend in the structural and typographic grammar of `clario.framer.website` while leaving the obsidian/bone/gold palette untouched.

**Architecture:** The change is delivered in three layers. A token layer (`globals.css`, `layout.tsx`) swaps the font family and decouples the radius chain; a primitive layer (`src/components/ui/*`) turns buttons into pills and cards into 20px surfaces; a composition layer rebuilds the landing page into Clario's thirteen-section run and rebuilds the auth shell. Dashboard and admin inherit the first two layers automatically and get a short targeted pass for the places the old language is hard-coded rather than tokenised.

**Tech Stack:** Next.js 16.2.10 (App Router), React 19.2.4, Tailwind v4 (`@theme inline`), `motion` v12, Radix primitives, `lucide-react`, `@react-three/fiber` + `drei`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-12-clario-format-frontend-design.md`

## Global Constraints

- Every token value in `:root` under `/* TradeForce design system */` keeps its current value. No hue, saturation or lightness changes. No lime, no pure white, no cool grey.
- `--font-sans` and `--font-display` both become **Manrope**. `--font-mono` stays **IBM Plex Mono**, used for data only (tabular numerals, timestamps, API keys, account numbers), never for decorative eyebrows.
- Heading tracking is `-0.04em` at weight `500`. h1 `64px/1.0`, h2 `48px/1.2`, h3 `34px/1.3`, body `16–18px/1.6`.
- Radius: `--radius-tile` `0.75rem`, `--radius-card` `1.25rem`, `--radius-panel` `1.875rem`. Buttons are full pills.
- The derived `--radius-sm/md/lg/xl` chain must **not** be anchored to the card radius. Form controls and overlays stay at control scale.
- `.ledger-row` is retired from the marketing site's own chrome, kept in dashboard tables, and kept inside anything depicting the product UI. `FeedRowView` is not modified, parameterised or forked.
- No dashboard component is refactored to accept marketing-shaped props.
- No fabricated proof. Testimonials and blog posts ship as empty arrays; their sections render nothing when empty.
- No invented commercial terms: no price, SLA, refund policy or prop-firm compatibility claim that no repo document supports. `FUNDED-ACCOUNTS.md` records that Maven bans EAs outright and three other firms require written approval.
- No new dependencies. No pricing monthly/yearly toggle.
- Motion: ~0.5s ease-out, 40–60px rise on entry, 60ms stagger between siblings. `src/components/motion/reveal.tsx` and `stagger.tsx` already exist and are **extended, not replaced** — every section's entry animation goes through them.
- `AGENTS.md`: read the relevant guide under `node_modules/next/dist/docs/` before writing code against an unfamiliar Next.js API.
- The existing `prefers-reduced-motion` block in `globals.css` must keep neutralising every animation added.

## Verification approach

This codebase has **no component or visual test infrastructure**: `vitest.config.ts` runs Node-environment tests over `src/**/*.test.ts` only. A redesign that breaks every page visually would still pass `npm test`. The spec accepts this and sets the real bar as running the app.

So: Task 3 carries genuine unit tests, because the content module holds real logic worth pinning (the anti-goal guards). Every other task verifies with `npx tsc --noEmit`, `npm run lint`, `npm run build`, and a named visual check at a named route and viewport. Those visual checks are not optional garnish — they are the only thing standing between this plan and a silently broken page. Do not add a test framework; that is scope the spec excludes.

## Review Focus

Five failure modes the spec implies that no unit test will catch. Each is pinned as an explicit check in the task that owns the code.

1. **`prefers-reduced-motion` users get a static page.** New scroll reveals and the testimonial marquee must be fully neutralised by the existing global block; a CSS-animated marquee honours it, a JS-driven one may not. — Tasks 4, 8.
2. **Narrow viewports.** A 64px h1 at 375px overflows; the reference is desktop-first and gives no mobile form. Every section needs a deliberate narrow layout. — every composition task, checked at 375px.
3. **Hidden sections leave holes.** With `TESTIMONIALS`, `POSTS` and `STAT_STRIP` empty, the page must not render orphaned headings, doubled borders or collapsed spacing between neighbours. — Tasks 3, 6, 8.
4. **Keyboard focus on new shapes.** Pills and the FAQ accordion must keep a visible `focus-visible` ring against the dark ground after the radius change. — Tasks 2, 8.
5. **Tabular alignment after the font swap.** `font-mono-tabular` (19 uses) and `font-mono` (52 uses) carry P/L columns and timestamps. Anything that silently moves to Manrope loses column alignment. — Tasks 1, 11.

---

### Task 1: Design tokens and font swap

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: Tailwind utilities `rounded-tile` (12px), `rounded-card` (20px), `rounded-panel` (30px); type utilities `.type-h1`, `.type-h2`, `.type-h3`; `.eyebrow` (the accent pill); `.glow-gold` (reusable outer glow). Every later task consumes these names.

- [ ] **Step 1: Swap the font in `src/app/layout.tsx`**

Replace the `Inter` and `Fraunces` imports with `Manrope` from `next/font/google`, bound to **both** `--font-inter` and `--font-fraunces` consumers via two new variables `--font-manrope`. Keep `IBM_Plex_Mono` exactly as it is. Manrope is a variable font — omit `weight` to get the full axis rather than listing weights.

- [ ] **Step 2: Repoint the font tokens in `globals.css`**

In `@theme inline`: `--font-sans: var(--font-manrope)`, `--font-display: var(--font-manrope)`, `--font-mono` unchanged.

- [ ] **Step 3: Decouple the radius chain in `globals.css`**

Add to `:root`: `--radius-control: 0.75rem`. In `@theme inline`, re-anchor the derived chain to it so controls stay tight — `--radius-lg: var(--radius-control)`, `--radius-md: calc(var(--radius-control) - 2px)`, `--radius-sm: calc(var(--radius-control) - 4px)`, `--radius-xl: calc(var(--radius-control) + 4px)`.

Then, **also in `@theme inline`**, add the three card-scale tokens — `--radius-tile: 0.75rem`, `--radius-card: 1.25rem`, `--radius-panel: 1.875rem`. Tailwind v4 generates `rounded-tile`, `rounded-card` and `rounded-panel` from the `--radius-*` namespace, which is where every later task's class names come from.

The existing `--radius: 0.5rem` declaration is removed only once nothing references it.

- [ ] **Step 4: Add the type scale and accent utilities to `globals.css`**

Three heading classes at the Global Constraints values, each fluid with `clamp()` so Review Focus #2 is handled at the token level rather than per section — h1 floors around `40px` at 375px, h2 around `32px`, h3 around `26px`. Add `.eyebrow` (inline-flex pill, `border-radius: 9999px`, `hsl(var(--primary))` text, `hsl(var(--primary) / 0.3)` border, `hsl(var(--primary) / 0.08)` fill) and `.glow-gold` (outer `box-shadow` in primary at low alpha, modelled on the existing `.border-gold-glow`).

Keep `.ledger-row`, `.text-gradient-gold`, `.font-mono-tabular`, `.bg-obsidian` and the `prefers-reduced-motion` block exactly as they are.

- [ ] **Step 5: Verify the build and the font swap**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all three pass.

- [ ] **Step 6: Visual check — Review Focus #5**

Run `npm run dev`, open `/dashboard/journal` and `/dashboard/violations`. Confirm the P/L and timestamp columns are still monospaced and column-aligned, i.e. `font-mono` and `font-mono-tabular` still resolve to IBM Plex Mono and did not follow the display face to Manrope.

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "Trade the serif for a single tight sans, and let cards round without dragging the inputs with them"
```

---

### Task 2: UI primitives

**Files:**
- Modify: `src/components/ui/button.tsx`, `card.tsx`, `input.tsx`, `textarea.tsx`, `select.tsx`, `dialog.tsx`, `sheet.tsx`, `badge.tsx`

**Interfaces:**
- Consumes: `rounded-tile`, `rounded-card`, `glow-gold` from Task 1.
- Produces: `Button` with pill geometry on every variant and size; `Card` at card radius. Signatures and variant names are unchanged, so every existing call site keeps working.

- [ ] **Step 1: Make buttons pills in `button.tsx`**

Change the base `rounded-md` to `rounded-full` and remove the per-size radius overrides on `sm` and `lg`. Keep every variant name (`default`, `gold`, `destructive`, `outline`, `secondary`, `ghost`, `link`), the `active:scale-[0.98]`, and the existing `focus-visible` ring. Add `glow-gold` to the `gold` variant so the primary CTA carries the reference's halo.

- [ ] **Step 2: Move cards and overlays to the new scale**

`card.tsx` → `rounded-card`. `dialog.tsx`, `sheet.tsx` → `rounded-card`. `input.tsx`, `textarea.tsx`, `select.tsx` → `rounded-tile`. `badge.tsx` → `rounded-full`.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass. No call site should need changing; if one does, the variant API drifted — restore it.

- [ ] **Step 4: Visual check — Review Focus #4**

With the dev server running, open `/login` and tab through every control. Confirm the focus ring is visible against the dark ground on pills and inputs, and that it follows the new radius rather than cutting a square corner through it.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui
git commit -m "Round the buttons all the way, the cards most of the way, the inputs a little"
```

---

### Task 3: Marketing content module

**Files:**
- Create: `src/lib/marketing/content.ts`
- Test: `src/lib/marketing/content.test.ts`

**Interfaces:**
- Produces, all consumed by Tasks 4–9:
  - `type Testimonial = { quote: string; name: string; role: string }`
  - `type Post = { slug: string; category: string; title: string; excerpt: string }`
  - `type Stat = { value: string; label: string }`
  - `type Step = { n: string; title: string; body: string }`
  - `type Faq = { n: string; question: string; answer: string }`
  - `type ComparisonRow = { them: string; us: string }`
  - `TESTIMONIALS: Testimonial[]`, `POSTS: Post[]`, `STAT_STRIP: Stat[]` — **all three ship `[]`**
  - `STEPS: Step[]` (3), `FAQS: Faq[]` (6), `COMPARISON: ComparisonRow[]` (5)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { TESTIMONIALS, POSTS, STAT_STRIP, FAQS, STEPS, COMPARISON } from "./content";

// Guards the spec's anti-goal: no fabricated proof on a live commercial product.
describe("unproven content ships empty", () => {
  it.each([["TESTIMONIALS", TESTIMONIALS], ["POSTS", POSTS], ["STAT_STRIP", STAT_STRIP]])(
    "%s is empty until real content exists",
    (_name, items) => expect(items).toHaveLength(0)
  );
});

describe("FAQ copy", () => {
  it("has six complete entries", () => {
    expect(FAQS).toHaveLength(6);
    for (const f of FAQS) {
      expect(f.question.trim()).not.toBe("");
      expect(f.answer.trim()).not.toBe("");
    }
  });

  // FUNDED-ACCOUNTS.md: Maven bans EAs outright, three other firms need
  // written approval. Blanket compatibility or support claims would be false.
  it.each([
    /any (funded|prop|broker)/i,
    /all (funded|prop) (accounts|firms)/i,
    /works with every/i,
    /24\/?7/i,
    /instant(ly)? refund/i,
    /money[- ]back guarantee/i,
  ])("makes no unsupported claim matching %s", (pattern) => {
    for (const f of FAQS) expect(f.answer).not.toMatch(pattern);
  });
});

describe("steps and comparison", () => {
  it("has three steps and five comparison rows", () => {
    expect(STEPS).toHaveLength(3);
    expect(COMPARISON).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- src/lib/marketing/content.test.ts`
Expected: FAIL — cannot resolve `./content`.

- [ ] **Step 3: Write `src/lib/marketing/content.ts`**

Export the six types and six consts above. Draft `STEPS`, `FAQS` and `COMPARISON` copy from `README.md`, `IMPLEMENTATION_GUIDE.md`, `FUNDED-ACCOUNTS.md` and the existing marketing components only — every claim must trace to one of those. The three steps are: connect the account, set the charter, let it enforce. The comparison's `them` column is journals, spreadsheets and willpower; the `us` column is what the EA actually does.

Where an FAQ answer would need a support time, refund term or firm-compatibility claim that no document supports, write the honest limited version instead of inventing one — on prop firms, say plainly that EA permission varies by firm and must be checked, which is what `FUNDED-ACCOUNTS.md` actually supports.

- [ ] **Step 4: Run the tests**

Run: `npm test -- src/lib/marketing/content.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/marketing
git commit -m "Put the landing copy in one place, and refuse to let it claim things we can't back"
```

---

### Task 4: Section shell, nav, and hero

**Files:**
- Create: `src/components/marketing/section.tsx`, `src/components/marketing/hero-frame.tsx`
- Modify: `src/components/marketing/nav.tsx`, `src/components/marketing/hero.tsx`

**Interfaces:**
- Consumes: Task 1 utilities; `Button` from Task 2.
- Produces: `<Section id eyebrow title description children />` — the shared shell every section from Task 5 onward uses, rendering the eyebrow pill, the `.type-h2` heading and the lead paragraph at the reference's rhythm. `<HeroFrame />` — the composed product frame.

- [ ] **Step 1: Build the `Section` shell**

`section.tsx` exports `Section`. Props: `id?: string`, `eyebrow?: string`, `title: string`, `description?: string`, `children: React.ReactNode`, `className?: string`. It owns the vertical rhythm and the max-width container so no section re-states them. **It renders nothing at all when `children` is `null`** — this is the mechanism Review Focus #3 depends on.

- [ ] **Step 2: Rebuild `nav.tsx` to the reference layout**

Logo left, links centred, two pills right: "Sign in" as `variant="secondary"`, "Start free" as `variant="gold"`. Links become `#how`, `#features`, `#pricing`, `#faq`. Drop the uppercase mono treatment — plain Manrope. Keep the existing `AnimatePresence` mobile drawer and its `aria-expanded` wiring.

- [ ] **Step 3: Build `hero-frame.tsx`**

A composed, near-static depiction of the dashboard inside a `rounded-panel` frame with a gold radial bloom behind it. Per the spec it reuses `FeedRowView` from `@/components/dashboard/enforcement-feed` (already presentational and client-safe) and otherwise renders its own small marketing-side composition — it must **not** import `EnforcementFeed` or `TodayStrip`, which are provider- and layout-coupled, and must not modify them. Hairlines are allowed here: this depicts the product.

One slow pulse on the live indicator, nothing else. No scripted feed — Task 7 owns that animation.

- [ ] **Step 4: Rebuild `hero.tsx`**

Eyebrow pill, `.type-h1` headline keeping the existing `text-gradient-gold` emphasis on one word, lead paragraph, two CTAs (gold pill + ghost with a play-style icon), then `<HeroFrame />`. The old left-hand "Live enforcement ledger" aside and its `.ledger-row` list are removed — that is the retired grammar, and the frame replaces it. Remove the `HeroScene` import; Task 5 rehouses the 3D scene.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 6: Visual check — Review Focus #1 and #2**

At `/`: confirm the hero reads correctly at 1440px and at 375px with no horizontal scroll and no clipped headline. Then enable "Reduce motion" at the OS level, reload, and confirm the hero is static and fully legible.

- [ ] **Step 7: Commit**

```bash
git add src/components/marketing
git commit -m "Give the page one section shell and a hero that shows the product instead of describing it"
```

---

### Task 5: How it works, and the bento

**Files:**
- Create: `src/components/marketing/how-it-works.tsx`, `src/components/marketing/bento.tsx`
- Modify: `src/components/three/governor-scene.tsx` (wrapper sizing only, if the bento cell needs it)

**Interfaces:**
- Consumes: `Section` (Task 4), `STEPS` (Task 3), `GovernorScene` from `@/components/three/governor-scene`.
- Produces: `<HowItWorks />`, `<Bento />`.

- [ ] **Step 1: Build `how-it-works.tsx`**

Three numbered step cards from `STEPS`, at `rounded-card`, with the step number in the accent pill treatment. Section id `how`.

- [ ] **Step 2: Build `bento.tsx` — four cards**

Discipline score, **governor ring**, violation centre, session control. `GovernorScene` is pointer-reactive inside an `aspect-square` wrapper, so it takes the **square cell** and the other three cards' spans are tuned around it. The enforcement feed does **not** appear here — it is already in the hero frame and the proof section, and a third instance would be a third copy of the same component on one page.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 4: Visual check — Review Focus #2**

At `/`, confirm the bento collapses to a single column at 375px with the 3D cell still square and still interactive. Confirm the hero paints before the governor ring does — the 3D scene is well below the fold and must not be what the page waits on.

- [ ] **Step 5: Commit**

```bash
git add src/components/marketing src/components/three
git commit -m "Three steps, four tiles, and a new home for the governor ring"
```

---

### Task 6: Stat strip, features, comparison

**Files:**
- Create: `src/components/marketing/stat-strip.tsx`, `src/components/marketing/comparison.tsx`
- Modify: `src/components/marketing/charter-features.tsx`

**Interfaces:**
- Consumes: `Section` (Task 4), `STAT_STRIP` and `COMPARISON` (Task 3).
- Produces: `<StatStrip />`, `<Comparison />`, `<CharterFeatures />` (same export name, new presentation).

- [ ] **Step 1: Build `stat-strip.tsx` — returns `null` when `STAT_STRIP` is empty**

This is the Review Focus #3 case that ships live, so get it right: an empty array renders nothing, not an empty band and not a heading with no content under it.

- [ ] **Step 2: Rebuild `charter-features.tsx` as the icon-card grid**

Keep all six provisions' titles and descriptions **verbatim** — the spec keeps the content and changes only the presentation. Replace the `.ledger-row` rows and Roman numerals with a six-up grid of `rounded-card` cards, each with a `rounded-tile` icon tile in primary. Pick icons from `lucide-react`. Section id `features`.

- [ ] **Step 3: Build `comparison.tsx`**

Two columns from `COMPARISON` — the `them` side muted, the `us` side in primary with check glyphs, as the reference does it.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 5: Visual check — Review Focus #3**

At `/`, confirm no gap, no stray border and no doubled spacing where the stat strip would be. The features section should sit against its neighbour as though the strip were never in the run.

- [ ] **Step 6: Commit**

```bash
git add src/components/marketing
git commit -m "Six provisions as cards, a comparison, and a stat strip that stays quiet until it has numbers"
```

---

### Task 7: Proof and pricing

**Files:**
- Create: `src/components/marketing/testimonials.tsx`
- Modify: `src/components/marketing/live-demo.tsx`, `src/components/marketing/pricing.tsx`

**Interfaces:**
- Consumes: `Section` (Task 4), `TESTIMONIALS` (Task 3).
- Produces: `<Testimonials />`, `<LiveDemo />`, `<Pricing />`.

- [ ] **Step 1: Restyle `live-demo.tsx` into the proof slot**

Keep the entire `SCRIPT`, the timing, the `useInView` gate and the `useReducedMotion` static fallback exactly as they are — this is the best thing on the current site and the spec promotes it unchanged in behaviour. Restyle the shell only: `rounded-card`, new type scale, eyebrow pill instead of the mono label. `FeedRowView` keeps its hairlines; this depicts the product.

- [ ] **Step 2: Build `testimonials.tsx` — returns `null` when `TESTIMONIALS` is empty**

Build the marquee layout the reference uses so it is ready for real quotes. Drive the scroll with **CSS animation**, not a JS loop, so the global `prefers-reduced-motion` block neutralises it for free (Review Focus #1).

- [ ] **Step 3: Restyle `pricing.tsx` — no toggle**

Keep both plans and all their copy. Clario's card treatment, `rounded-card`, POPULAR badge on the featured plan. **No monthly/yearly toggle** — there is no yearly price and no Stripe, and inventing a discount is the fabrication the spec forbids.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 5: Visual check — Review Focus #1 and #3**

At `/`: the demo feed still plays its eight rows and still blocks trade #6. With "Reduce motion" on, the feed renders its full script statically and the marquee does not move. Confirm nothing renders where the testimonial section sits.

- [ ] **Step 6: Commit**

```bash
git add src/components/marketing
git commit -m "Keep the one piece of proof we actually have, and leave the praise slot empty until it's earned"
```

---

### Task 8: FAQ, blog, contact, closing CTA, footer, and page assembly

**Files:**
- Create: `src/components/marketing/faq.tsx`, `src/components/marketing/blog-grid.tsx`, `src/components/marketing/closing-cta.tsx`
- Modify: `src/components/marketing/contact.tsx`, `src/components/marketing/footer.tsx`, `src/app/page.tsx`

**Interfaces:**
- Consumes: `Section` (Task 4), `FAQS` and `POSTS` (Task 3), every component from Tasks 4–7.
- Produces: the assembled landing page.

- [ ] **Step 1: Build `faq.tsx`**

A numbered accordion, `01`–`06`, from `FAQS`. Build it on `@radix-ui/react-accordion` if present; it is **not** in `package.json`, so otherwise use the existing `Collapsible`-style pattern or a `<details>`-based implementation rather than adding a dependency. Each row must be keyboard-operable with a visible focus ring (Review Focus #4). Section id `faq`.

- [ ] **Step 2: Build `blog-grid.tsx` — returns `null` when `POSTS` is empty**

One featured post plus three compact ones, as the reference lays it out. Ships rendering nothing; there is no CMS and no posts.

- [ ] **Step 3: Restyle `contact.tsx` and build `closing-cta.tsx`**

`contact.tsx` keeps its `useActionState` wiring, its server action and its success state untouched — it feeds the admin inbox and the cloud-EA request channel, so this is a restyle only. `closing-cta.tsx` is the full-width band above the footer.

- [ ] **Step 4: Rebuild `footer.tsx` as three columns**

Brand blurb, Quick Menu, Information — matching the reference's structure with real TradeForce links only. No link to a page that does not exist.

- [ ] **Step 5: Assemble `src/app/page.tsx`**

The thirteen-section run in order: Nav, Hero, HowItWorks, Bento, StatStrip, CharterFeatures, Comparison, LiveDemo, Testimonials, Pricing, Faq, BlogGrid, Contact, ClosingCta, Footer.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: all pass.

- [ ] **Step 7: Visual check — Review Focus #1, #2, #3, #4**

At `/`: scroll the whole page at 1440px and at 375px. Confirm no horizontal scroll at either, no gap where the three hidden sections sit, every heading legible, and the FAQ fully operable by keyboard with a visible ring. Then with "Reduce motion" on, confirm the entire page is static.

- [ ] **Step 8: Commit**

```bash
git add src/components/marketing src/app/page.tsx
git commit -m "Close the page out: questions, contact, and a last ask"
```

---

### Task 9: Auth shell

**Files:**
- Modify: `src/components/auth/auth-shell.tsx`

**Interfaces:**
- Consumes: Task 1 utilities, Task 2 primitives.
- Produces: `AuthShell` with its existing props unchanged, so `/login`, `/signup`, `/reset-password` and `/update-password` need no edits.

- [ ] **Step 1: Rebuild the shell**

Replace the hard-coded retired grammar — the "Live enforcement ledger" `.ledger-row` list with zero-padded numerals, the Fraunces display face, the mono letterspaced eyebrow — with the new language. The left panel becomes the reference's treatment: eyebrow pill, `.type-h2` headline, and a `rounded-panel` surface with the gold bloom rather than a hairline list. Keep the props signature exactly.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass, with no changes needed in the four auth routes.

- [ ] **Step 3: Visual check — Review Focus #2 and #4**

Walk `/login`, `/signup`, `/reset-password`, `/update-password` at 1440px and 375px. Confirm each renders, the forms submit, and focus rings are visible. This is the screen directly behind the hero's "Start free" pill — it must not look like a different product.

- [ ] **Step 4: Commit**

```bash
git add src/components/auth
git commit -m "Stop the sign-up screen looking like the site it came from a year ago"
```

---

### Task 10: Dashboard and onboarding pass

**Files:**
- Modify: `src/components/dashboard/sidebar.tsx`, `page-header.tsx`, `stat-tile.tsx`
- Modify: `src/components/onboarding/wizard.tsx`
- Modify: hard-coded `rounded-*` call sites across `src/components/dashboard`, `src/components/admin`, `src/app/dashboard`, `src/app/admin`

**Interfaces:**
- Consumes: Task 1 utilities, Task 2 primitives. No new exports.

- [ ] **Step 1: The three shell components**

`sidebar.tsx` — nav items to pill shapes. `page-header.tsx` — the mono letterspaced eyebrow becomes the `.eyebrow` pill; keep `renderTitle` and the `titleEmphasis` gradient behaviour. `stat-tile.tsx` — `rounded-card`, new type scale, and `font-mono` dropped from the **label** while `font-mono-tabular` stays on the **value**.

- [ ] **Step 2: Sweep the hard-coded radii**

There are 20 `rounded-md`, 18 `rounded-lg`, 15 `rounded-xl` and 3 `rounded-sm` uses. Anything that is a **card or panel surface** moves to `rounded-card`; anything that is a **control, overlay or small chip** stays on the control chain. Do not blanket-replace.

- [ ] **Step 3: Onboarding**

`wizard.tsx` uses `.ledger-row`. It sits between signup and the dashboard, inside the conversion flow Task 9 just rebuilt, so bring it to the new language too. Tables elsewhere keep their hairlines.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: all pass.

- [ ] **Step 5: Visual check — Review Focus #5**

Walk `/dashboard`, `/dashboard/journal`, `/dashboard/violations`, `/dashboard/settings`, `/dashboard/trading-plan`, `/onboarding`. Confirm tabular columns are still aligned and still monospaced, tables still read densely, and no surface is left at the old 8px radius beside a new 20px one.

- [ ] **Step 6: Commit**

```bash
git add src/components src/app
git commit -m "Carry the new language into the product, without flattening the tables"
```

---

### Task 11: Whole-surface verification

**Files:** none modified unless a defect is found.

- [ ] **Step 1: Full gate**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm test`
Expected: all four pass.

- [ ] **Step 2: Route walk**

With the dev server running, visit every route at 1440px and 375px: `/`, `/login`, `/signup`, `/reset-password`, `/update-password`, `/onboarding`, `/dashboard` and its six children, and `/admin` and its six children. Record anything still carrying the old language.

- [ ] **Step 3: Palette audit**

Confirm no lime, no pure white and no cool grey entered the codebase: `grep -rn "8CFF2E\|#fff\|#FFFFFF" src --include='*.tsx' --include='*.css'`. Expected: no hits introduced by this work.

- [ ] **Step 4: Fix anything the walk found, then re-run Step 1 and commit**

```bash
git add -A
git commit -m "Close the gaps the walk turned up"
```

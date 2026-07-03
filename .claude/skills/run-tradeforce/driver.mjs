#!/usr/bin/env node
// Agent driver for TradeForce. Drives the running dev server through real user
// flows with headless Chrome (playwright-core + installed Google Chrome — no
// browser download). Run from the repo root:
//
//   node .claude/skills/run-tradeforce/driver.mjs smoke
//   node .claude/skills/run-tradeforce/driver.mjs shot /dashboard/analytics --email E --password P
//   node .claude/skills/run-tradeforce/driver.mjs shot /login
//
// BASE_URL env or --base overrides http://localhost:3000.
// Screenshots land in .claude/skills/run-tradeforce/shots/.

import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SHOTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "shots");
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
mkdirSync(SHOTS_DIR, { recursive: true });

const args = process.argv.slice(2);
const cmd = args[0];
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : undefined;
}
const BASE = (flag("base") ?? process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

function log(msg) {
  console.log(`[driver] ${msg}`);
}

async function launch() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  return { browser, page };
}

async function shoot(page, name) {
  const file = join(SHOTS_DIR, name);
  await page.screenshot({ path: file, fullPage: false });
  log(`screenshot → ${file}`);
}

async function login(page, email, password, next = "/dashboard") {
  await page.goto(`${BASE}/login?next=${encodeURIComponent(next)}`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`**${next}**`, { timeout: 20000 });
}

// Signing up through the UI sends a Supabase confirmation email and hits the
// built-in SMTP rate limit (~2/hour) — useless for automation. Instead we
// create a pre-confirmed user through the GoTrue admin API with the service
// role key from .env.local, then log in through the real UI.
function supabaseEnv() {
  const env = Object.fromEntries(
    readFileSync(join(REPO_ROOT, ".env.local"), "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
  );
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local");
  return { url, serviceKey };
}

function supabaseAdmin() {
  const { url, serviceKey } = supabaseEnv();
  return async (path, init = {}) => {
    const res = await fetch(`${url}/auth/v1${path}`, {
      ...init,
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
        ...init.headers,
      },
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
}

// The dashboard layout requires profiles.onboarded_at; the wizard UI is a
// manual/visual flow, and smoke targets the EA loop — so stamp the flags
// directly via PostgREST. Also completes the tour so its overlay never
// intercepts clicks or screenshots.
async function markOnboarded(userId) {
  const { url, serviceKey } = supabaseEnv();
  const now = new Date().toISOString();
  const res = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({ onboarded_at: now, tour_completed_at: now }),
  });
  if (res.status >= 300) throw new Error(`markOnboarded failed (${res.status}): ${await res.text()}`);
  log("stamped profile onboarded + tour done (wizard UI not under smoke)");
}

async function createConfirmedUser() {
  const email = `tf-smoke-${Date.now()}@example.com`;
  const password = "smoke-test-pass-1";
  const admin = supabaseAdmin();
  const { status, json } = await admin("/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (status !== 200 || !json?.id) throw new Error(`admin createUser failed (${status}): ${JSON.stringify(json)}`);
  log(`created confirmed user ${email} (id ${json.id})`);
  return { email, password, id: json.id, admin };
}

async function deleteUser(admin, id) {
  const { status } = await admin(`/admin/users/${id}`, { method: "DELETE" });
  // All tables cascade from auth.users, so this removes the account, api_keys
  // and trades the smoke run created.
  log(status === 200 ? `deleted smoke user ${id} (cascade cleans all rows)` : `WARN: delete user → ${status}`);
}

async function generateApiKey(page) {
  await page.goto(`${BASE}/dashboard/settings`);
  await page.getByRole("button", { name: "Generate EA key" }).click();
  await page.fill("#key-label", "smoke-test");
  await page.getByRole("button", { name: "Generate key" }).click();
  // The one-time raw key renders in a <code> element inside the dialog.
  const rawKey = await page.locator("[role=dialog] code").textContent({ timeout: 15000 });
  if (!rawKey?.startsWith("tf_live_")) throw new Error(`unexpected raw key: ${rawKey}`);
  await shoot(page, "03-settings-key.png");
  await page.getByRole("button", { name: "Done" }).click();
  log(`generated API key ${rawKey.slice(0, 16)}…`);
  return rawKey;
}

async function eaFetch(path, { key, method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function expect(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  log(`ok: ${label}`);
}

async function smoke() {
  const keepUser = args.includes("--keep-user");
  const { browser, page } = await launch();
  let user;
  try {
    // 1. Marketing landing page (public)
    await page.goto(BASE, { waitUntil: "networkidle" });
    expect(await page.title(), "landing page has a title");
    await shoot(page, "01-landing.png");

    // 2. Auth gate: /dashboard logged-out bounces to /login
    await page.goto(`${BASE}/dashboard`);
    await page.waitForURL("**/login**");
    log("ok: logged-out /dashboard redirects to /login");

    // 3. Admin-create a confirmed throwaway user, stamp it onboarded, and log
    // in straight to /dashboard. Landing on the dashboard first is deliberate:
    // its Promise.all reads used to race getOrCreatePrimaryAccount into
    // duplicate primary accounts, which the accounts_one_primary_per_user_idx
    // migration + 23505 re-read now prevent — this is the regression check.
    user = await createConfirmedUser();
    await markOnboarded(user.id);
    await login(page, user.email, user.password, "/dashboard");
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await shoot(page, "02-dashboard.png");

    // 4. Generate an EA API key via the settings UI
    const key = await generateApiKey(page);

    // 5. EA API smoke against the real endpoints
    const noAuth = await eaFetch("/api/ea/config");
    expect(noAuth.status === 401, `GET /api/ea/config without key → 401 (got ${noAuth.status})`);

    const config = await eaFetch("/api/ea/config", { key });
    expect(config.status === 200, `GET /api/ea/config with key → 200 (got ${config.status})`);
    log(`   config: ${JSON.stringify(config.json)}`);

    const trade = await eaFetch("/api/ea/trades", {
      key,
      method: "POST",
      body: {
        symbol: "EURUSD",
        direction: "LONG",
        entryPrice: 1.0842,
        exitPrice: 1.0901,
        quantity: 1.5,
        pnl: 88.5,
        entryTime: new Date(Date.now() - 3600_000).toISOString(),
        exitTime: new Date().toISOString(),
      },
    });
    expect(trade.status === 201 && trade.json?.tradeId, `POST /api/ea/trades → 201 (got ${trade.status})`);

    const account = await eaFetch("/api/ea/account", {
      key,
      method: "POST",
      body: { equity: 100088.5 },
    });
    expect(account.status === 200, `POST /api/ea/account → 200 (got ${account.status})`);

    const ping = await eaFetch("/api/ea/ping", { key });
    expect(ping.status === 200, `GET /api/ea/ping → 200 (got ${ping.status})`);
    log(`   ping: ${JSON.stringify(ping.json)}`);

    const violation = await eaFetch("/api/ea/violations", {
      key,
      method: "POST",
      body: { type: "OVERTRADING", details: { tradesToday: 9, cap: 5 } },
    });
    expect(
      violation.status === 201 && violation.json?.violationId,
      `POST /api/ea/violations → 201 (got ${violation.status})`
    );

    // 6. The EA-posted data shows up in the UI
    await page.goto(`${BASE}/dashboard/journal`, { waitUntil: "networkidle" });
    await shoot(page, "04-journal.png");
    const journal = await page.locator("main").textContent();
    expect(journal?.includes("EURUSD"), "journal page shows the EA-posted EURUSD trade");

    await page.goto(`${BASE}/dashboard/violations`, { waitUntil: "networkidle" });
    await shoot(page, "05-violations.png");
    const violationsPage = await page.locator("main").textContent();
    expect(violationsPage?.includes("Overtrading"), "violations page shows the EA-reported breach");

    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    const dash = await page.locator("main").textContent();
    expect(dash?.includes("Connected"), "dashboard EA-connection tile shows Connected");

    log("SMOKE PASSED");
    if (keepUser) log(`kept smoke user: ${user.email} / ${user.password}`);
  } finally {
    if (user && !keepUser) await deleteUser(user.admin, user.id).catch((e) => log(`WARN: cleanup failed: ${e.message}`));
    await browser.close();
  }
}

async function shot(route) {
  const email = flag("email");
  const password = flag("password");
  const out = flag("out") ?? `shot-${route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home"}.png`;
  const { browser, page } = await launch();
  try {
    if (email && password) await login(page, email, password);
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    await shoot(page, out);
  } finally {
    await browser.close();
  }
}

try {
  if (cmd === "smoke") await smoke();
  else if (cmd === "shot" && args[1]) await shot(args[1]);
  else {
    console.log("usage: driver.mjs smoke [--keep-user] | shot <route> [--email E --password P] [--out f.png] [--base URL]");
    process.exit(2);
  }
} catch (err) {
  console.error(`[driver] ${err.message}`);
  process.exit(1);
}

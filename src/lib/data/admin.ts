import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { log } from "@/lib/log";

/**
 * Ops queries. Read with the service role deliberately: the console must span
 * EVERY tenant, which is the opposite of the RLS the rest of the app relies on.
 * Access is gated in the admin layout, not by RLS.
 */

export type PoolServer = {
  host: string;
  cores: number | null;
  ram_total_mb: number | null;
  ram_free_mb: number | null;
  disk_free_mb: number | null;
  load_1m: number | null;
  instances: number;
  capacity: number | null;
  image_tag: string | null;
  agent_version: string | null;
  last_seen_at: string;
};

/** A monitored EA, whether it runs in our cloud or on the trader's own PC. */
export type OpsEa = {
  account_id: string;
  user_id: string;
  email: string | null;
  kind: "cloud" | "desktop";
  eaLastSeenAt: string | null;

  // cloud only
  mt5_login: string | null;
  mt5_server: string | null;
  server_host: string | null;
  desired_state: string | null;
  status: string | null;
  status_detail: string | null;
  cpu_cores: number | null;
  mem_mb: number | null;
  restarts: number | null;
  started_at: string | null;
  ea_version: string | null;
  ea_failed_fetches: number | null;
  ea_last_http_status: number | null;
  ea_queued_posts: number | null;
  ea_from_cache: boolean | null;
  ea_backoff_seconds: number | null;
};

export async function getPoolServers(): Promise<PoolServer[]> {
  const { data, error } = await createServiceClient()
    .from("pool_servers").select("*").order("host");
  if (error) throw new Error(error.message);
  return (data ?? []) as PoolServer[];
}

/**
 * Every account with a live EA key — not just cloud instances.
 *
 * The first version of this only listed mt5_instances, which made desktop-EA
 * users invisible: an operator could not see that a desktop user's EA had been
 * dead for 37 days, which is exactly the kind of silence this console exists
 * to surface.
 */
export async function getOpsEas(): Promise<OpsEa[]> {
  const supabase = createServiceClient();

  const [{ data: keys }, { data: instances }, { data: profiles }] = await Promise.all([
    supabase.from("api_keys")
      .select("account_id, user_id, last_used_at, revoked_at").is("revoked_at", null),
    supabase.from("mt5_instances").select("*").neq("desired_state", "removed"),
    supabase.from("profiles").select("id, email"),
  ]);

  const emails = new Map((profiles ?? []).map((p) => [p.id, p.email]));
  const inst = new Map((instances ?? []).map((i) => [i.account_id, i]));

  // Latest heartbeat per account across all its keys.
  const seen = new Map<string, { userId: string; last: string | null }>();
  for (const k of keys ?? []) {
    const cur = seen.get(k.account_id);
    if (!cur || (k.last_used_at && (!cur.last || k.last_used_at > cur.last))) {
      seen.set(k.account_id, { userId: k.user_id, last: k.last_used_at ?? cur?.last ?? null });
    }
  }
  for (const i of instances ?? []) {
    if (!seen.has(i.account_id)) seen.set(i.account_id, { userId: i.user_id, last: null });
  }

  const rows: OpsEa[] = [];
  for (const [accountId, v] of seen) {
    const i = inst.get(accountId);
    rows.push({
      account_id: accountId,
      user_id: v.userId,
      email: emails.get(v.userId) ?? null,
      kind: i ? "cloud" : "desktop",
      eaLastSeenAt: v.last,
      mt5_login: i?.mt5_login ?? null,
      mt5_server: i?.mt5_server ?? null,
      server_host: i?.server_host ?? null,
      desired_state: i?.desired_state ?? null,
      status: i?.status ?? null,
      status_detail: i?.status_detail ?? null,
      cpu_cores: i?.cpu_cores ?? null,
      mem_mb: i?.mem_mb ?? null,
      restarts: i?.restarts ?? null,
      started_at: i?.started_at ?? null,
      ea_version: i?.ea_version ?? null,
      ea_failed_fetches: i?.ea_failed_fetches ?? null,
      ea_last_http_status: i?.ea_last_http_status ?? null,
      ea_queued_posts: i?.ea_queued_posts ?? null,
      ea_from_cache: i?.ea_from_cache ?? null,
      ea_backoff_seconds: i?.ea_backoff_seconds ?? null,
    });
  }
  // Cloud first, then by most recently seen.
  rows.sort((a, b) =>
    a.kind !== b.kind ? (a.kind === "cloud" ? -1 : 1) : (b.eaLastSeenAt ?? "").localeCompare(a.eaLastSeenAt ?? ""));
  return rows;
}

export type Outage = { started_at: string; ended_at: string; minutes: number };

/** Gaps in the EA heartbeat. See the ea_outages() comment for why this is free. */
export async function getOutages(accountId: string, days = 30, minMinutes = 20): Promise<Outage[] | null> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await createServiceClient().rpc("ea_outages", {
    p_account_id: accountId, p_since: since, p_min_minutes: minMinutes,
  });
  // Degrade rather than 500 the whole page: the uptime history is the newest
  // part of the console and its migration may not be applied yet. Everything
  // else on the page is still worth showing.
  if (error) {
    log.warn("ea_outages unavailable", { detail: error.message });
    return null;
  }
  return data ?? [];
}

/** Every account's gaps in one scan. See ea_outages_all() for why. */
export async function getAllOutages(days = 30, minMinutes = 20): Promise<(Outage & { account_id: string })[] | null> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await createServiceClient().rpc("ea_outages_all", {
    p_since: since, p_min_minutes: minMinutes,
  });
  if (error) {
    log.warn("ea_outages_all unavailable", { detail: error.message });
    return null;
  }
  return data ?? [];
}

export async function getUptimePct(accountId: string, days = 7): Promise<number | null> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await createServiceClient().rpc("ea_uptime_pct", {
    p_account_id: accountId, p_since: since, p_min_minutes: 20,
  });
  if (error) return null;
  return typeof data === "number" ? data : null;
}

export type EaDetail = {
  /** Read once here so the page can render purely from its props. */
  now: number;
  ea: OpsEa;
  profile: { email: string; full_name: string | null; timezone: string; prop_firm: string | null; created_at: string } | null;
  account: { name: string; broker: string | null; starting_balance: number | null; current_equity: number | null; is_primary: boolean } | null;
  rules: Record<string, unknown> | null;
  server: PoolServer | null;
  uptime7d: number | null;
  /** null = the uptime query is unavailable, NOT 'no outages'. */
  outages: Outage[] | null;
  violations: { id: string; type: string; occurred_at: string; details: unknown }[];
  trades: { id: string; symbol: string | null; pnl: number | null; exit_time: string | null }[];
  events: { event_type: string; occurred_at: string; details: unknown }[];
  snapshots: { equity: number; recorded_at: string }[];
};

export async function getEaDetail(accountId: string): Promise<EaDetail | null> {
  const supabase = createServiceClient();
  const eas = await getOpsEas();
  const ea = eas.find((e) => e.account_id === accountId);
  if (!ea) return null;

  const [
    { data: profile }, { data: account }, { data: rules }, { data: violations },
    { data: trades }, { data: events }, { data: snapshots }, servers,
  ] = await Promise.all([
    supabase.from("profiles").select("email, full_name, timezone, prop_firm, created_at").eq("id", ea.user_id).maybeSingle(),
    supabase.from("accounts").select("name, broker, starting_balance, current_equity, is_primary").eq("id", accountId).maybeSingle(),
    supabase.from("trading_rules").select("*").eq("account_id", accountId).maybeSingle(),
    supabase.from("violations").select("id, type, occurred_at, details")
      .eq("account_id", accountId).order("occurred_at", { ascending: false }).limit(25),
    supabase.from("trades").select("id, symbol, pnl, exit_time")
      .eq("account_id", accountId).order("exit_time", { ascending: false }).limit(25),
    supabase.from("ea_events").select("event_type, occurred_at, details")
      .eq("account_id", accountId).order("occurred_at", { ascending: false }).limit(25),
    supabase.from("account_snapshots").select("equity, recorded_at")
      .eq("account_id", accountId).order("recorded_at", { ascending: false }).limit(240),
    getPoolServers(),
  ]);

  const [uptime7d, outages] = await Promise.all([
    getUptimePct(accountId, 7),
    getOutages(accountId, 30),
  ]);

  return {
    now: Date.now(),
    ea, profile: profile ?? null, account: account ?? null, rules: rules ?? null,
    server: servers.find((s) => s.host === ea.server_host) ?? null,
    uptime7d, outages,
    violations: (violations ?? []) as EaDetail["violations"],
    trades: (trades ?? []) as EaDetail["trades"],
    events: (events ?? []) as EaDetail["events"],
    snapshots: ((snapshots ?? []) as EaDetail["snapshots"]).reverse(),
  };
}

/**
 * Every person who ever signed up, whether or not they got as far as
 * connecting anything. getOpsEas() only sees accounts with a key or a cloud
 * instance, so someone who signed up and stalled is invisible there -- which
 * is exactly the person an operator needs to see during a trial.
 */
export type Signup = {
  userId: string;
  email: string;
  fullName: string | null;
  propFirm: string | null;
  createdAt: string;
  onboardedAt: string | null;
  accountId: string | null;
  broker: string | null;
  equity: number | null;
  rulesConfigured: boolean;
  rulesActive: boolean;
  connection: "cloud" | "desktop" | "none";
  cloudStatus: string | null;
  cloudDesired: string | null;
  cloudDetail: string | null;
  mt5Login: string | null;
  mt5Server: string | null;
  serverHost: string | null;
  activeKeys: number;
  lastSeenAt: string | null;
  /** When the current hosted terminal was asked for (started, or first requested). */
  cloudSince: string | null;
  eaTradeBlock: string | null;
  refusedCloses24h: number;
};

export async function getSignups(): Promise<Signup[]> {
  const supabase = createServiceClient();
  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [
    { data: profiles },
    { data: accounts },
    { data: rules },
    { data: keys },
    { data: instances },
    { data: refused },
  ] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, prop_firm, created_at, onboarded_at"),
    supabase.from("accounts").select("id, user_id, broker, current_equity, is_primary, ea_trade_block"),
    supabase.from("trading_rules").select("account_id, is_active, daily_loss_limit, max_trades_per_day"),
    supabase.from("api_keys").select("user_id, account_id, last_used_at, revoked_at"),
    supabase.from("mt5_instances").select("*"),
    // EA v1.27+ records closes the broker refused; older rows have no flag.
    supabase.from("violations").select("account_id").eq("details->>closed", "false").gte("occurred_at", since24h),
  ]);
  const refusedByAccount = new Map<string, number>();
  for (const r of refused ?? []) refusedByAccount.set(r.account_id, (refusedByAccount.get(r.account_id) ?? 0) + 1);

  const acctByUser = new Map<string, (typeof accounts extends (infer T)[] | null ? T : never)>();
  for (const a of accounts ?? []) {
    const cur = acctByUser.get(a.user_id);
    if (!cur || a.is_primary) acctByUser.set(a.user_id, a);
  }
  const rulesByAccount = new Map((rules ?? []).map((r) => [r.account_id, r]));
  const instByAccount = new Map((instances ?? []).map((i) => [i.account_id, i]));

  return (profiles ?? [])
    .map((p) => {
      const account = acctByUser.get(p.id) ?? null;
      const rule = account ? rulesByAccount.get(account.id) : undefined;
      const inst = account ? instByAccount.get(account.id) : undefined;
      const mine = (keys ?? []).filter((k) => k.user_id === p.id && !k.revoked_at);
      const lastSeenAt = mine.reduce<string | null>(
        (best, k) => (k.last_used_at && (!best || k.last_used_at > best) ? k.last_used_at : best),
        null
      );
      const hasCloud = Boolean(inst && inst.desired_state !== "removed");
      return {
        userId: p.id,
        email: p.email,
        fullName: p.full_name,
        propFirm: p.prop_firm,
        createdAt: p.created_at,
        onboardedAt: p.onboarded_at,
        accountId: account?.id ?? null,
        broker: account?.broker ?? null,
        equity: account?.current_equity ?? null,
        rulesConfigured: Boolean(rule && (rule.daily_loss_limit || rule.max_trades_per_day)),
        rulesActive: Boolean(rule?.is_active),
        connection: hasCloud ? "cloud" : mine.length > 0 ? "desktop" : "none",
        cloudStatus: inst?.status ?? null,
        cloudDesired: inst?.desired_state ?? null,
        cloudDetail: inst?.status_detail ?? null,
        mt5Login: inst?.mt5_login ?? null,
        mt5Server: inst?.mt5_server ?? null,
        serverHost: inst?.server_host ?? null,
        activeKeys: mine.length,
        lastSeenAt,
        // Waiting rows have no container, so nothing bumps updated_at after the
        // request or the claim; started_at is left over from the previous one.
        cloudSince: !inst
          ? null
          : inst.status === "pending" || inst.status === "provisioning"
            ? inst.updated_at
            : (inst.started_at ?? inst.created_at),
        eaTradeBlock: account?.ea_trade_block ?? null,
        refusedCloses24h: account ? (refusedByAccount.get(account.id) ?? 0) : 0,
      } satisfies Signup;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

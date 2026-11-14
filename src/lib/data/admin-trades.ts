import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { assertAdmin } from "@/lib/admin";
import { safeTimezone } from "@/lib/time-boundaries";
import { summariseTrades, type JournalSummary } from "@/lib/journal-summary";
import type { Trade } from "@/lib/data/trades";

/**
 * Trades across every tenant, for the ops console.
 *
 * Service role, like the rest of src/lib/data/admin.ts: the console reads other
 * people's rows by definition, so RLS cannot be the authorization here. Which
 * means the allowlist has to be, and every exported function below asserts it
 * before issuing a query - see assertAdmin() for why the /admin layout alone is
 * not enough.
 */

/** PostgREST caps a response server-side, so pages are read rather than assumed. */
const PAGE = 1000;
/**
 * A stop so a runaway account cannot hang the request. If it is ever reached
 * the journal says so rather than presenting a partial record as complete -
 * see JournalExport.truncated.
 */
const CEILING = 20_000;

export type TradeOwner = {
  accountId: string;
  userId: string;
  email: string;
  fullName: string | null;
  accountName: string;
  broker: string | null;
  /** The trader's own zone: the clock their trading day is measured on. */
  timezone: string;
};

export type AdminTrade = Trade & { owner: TradeOwner | null };

/** Accounts that have at least one trade, for the filter and the index. */
export type TradedAccount = TradeOwner & { trades: number; lastEntry: string | null };

async function ownerIndex(): Promise<Map<string, TradeOwner>> {
  const supabase = createServiceClient();
  const [{ data: accounts, error: aErr }, { data: profiles, error: pErr }] = await Promise.all([
    supabase.from("accounts").select("id, user_id, name, broker"),
    supabase.from("profiles").select("id, email, full_name, timezone"),
  ]);
  // Throw rather than degrade: a trade row with no owner attached is worse than
  // an error page, because the operator cannot tell whose journal they are in.
  if (aErr) throw new Error(`accounts read failed: ${aErr.message}`);
  if (pErr) throw new Error(`profiles read failed: ${pErr.message}`);

  const byUser = new Map((profiles ?? []).map((p) => [p.id, p]));
  const out = new Map<string, TradeOwner>();
  for (const a of accounts ?? []) {
    const p = byUser.get(a.user_id);
    out.set(a.id, {
      accountId: a.id,
      userId: a.user_id,
      email: p?.email ?? "(unknown)",
      fullName: p?.full_name ?? null,
      accountName: a.name,
      broker: a.broker,
      // Through the same validator the write path uses. An invalid zone would
      // make formatInTimeZone throw, which would take the whole console down
      // for every operator - a stored value is not a trusted one.
      timezone: safeTimezone(p?.timezone),
    });
  }
  return out;
}

/** The most recent trades, across all accounts or within one. */
export async function getAdminTrades(
  opts: { accountId?: string; limit?: number } = {}
): Promise<AdminTrade[]> {
  await assertAdmin();
  const limit = Math.min(opts.limit ?? 500, PAGE);
  let query = createServiceClient()
    .from("trades")
    .select("*")
    .order("entry_time", { ascending: false })
    .limit(limit);
  if (opts.accountId) query = query.eq("account_id", opts.accountId);

  const [{ data, error }, owners] = await Promise.all([query, ownerIndex()]);
  if (error) throw new Error(`trades read failed: ${error.message}`);
  return (data ?? []).map((t) => ({ ...t, owner: owners.get(t.account_id) ?? null }));
}

/**
 * One row per account that has traded, busiest first.
 *
 * ponytail: counts every trade row in the app rather than in SQL, because
 * supabase-js cannot GROUP BY without a view or an RPC. Fine at 346 rows;
 * if the table reaches six figures this wants a view alongside ea_outages().
 */
export async function getTradedAccounts(): Promise<TradedAccount[]> {
  await assertAdmin();
  const [{ data, error }, owners] = await Promise.all([
    createServiceClient().from("trades").select("account_id, entry_time").limit(CEILING),
    ownerIndex(),
  ]);
  if (error) throw new Error(`trades read failed: ${error.message}`);

  const counts = new Map<string, { trades: number; lastEntry: string | null }>();
  for (const row of data ?? []) {
    const seen = counts.get(row.account_id) ?? { trades: 0, lastEntry: null };
    seen.trades += 1;
    if (row.entry_time && (!seen.lastEntry || row.entry_time > seen.lastEntry)) {
      seen.lastEntry = row.entry_time;
    }
    counts.set(row.account_id, seen);
  }

  return [...counts.entries()]
    .flatMap(([accountId, c]) => {
      const owner = owners.get(accountId);
      return owner ? [{ ...owner, ...c }] : [];
    })
    .sort((a, b) => b.trades - a.trades);
}

export type JournalExport = {
  owner: TradeOwner;
  startingBalance: number | null;
  currentEquity: number | null;
  /** Oldest first: a journal reads forwards. */
  trades: Trade[];
  summary: JournalSummary;
  /** True only if CEILING was hit, in which case the record is incomplete. */
  truncated: boolean;
  generatedAt: string;
};

/**
 * Everything one account's journal contains, oldest trade first.
 *
 * Read in pages until a short one comes back, because a single .limit() is
 * silently clamped by PostgREST's own max-rows and would hand back a partial
 * journal that looks whole. Returns null when the account does not exist.
 */
export async function getAccountJournal(accountId: string): Promise<JournalExport | null> {
  await assertAdmin();
  const supabase = createServiceClient();

  const [{ data: account, error: aErr }, owners] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, starting_balance, current_equity")
      .eq("id", accountId)
      .maybeSingle(),
    ownerIndex(),
  ]);
  if (aErr) throw new Error(`account read failed: ${aErr.message}`);
  const owner = account ? owners.get(account.id) : undefined;
  if (!account || !owner) return null;

  const trades: Trade[] = [];
  let truncated = false;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("trades")
      .select("*")
      .eq("account_id", accountId)
      .order("entry_time", { ascending: true })
      .order("id", { ascending: true }) // stable across pages when times tie
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`trades read failed: ${error.message}`);

    const batch = data ?? [];
    trades.push(...batch);
    if (batch.length < PAGE) break;
    if (trades.length >= CEILING) {
      truncated = true;
      break;
    }
  }

  return {
    owner,
    startingBalance: account.starting_balance,
    currentEquity: account.current_equity,
    trades,
    summary: summariseTrades(trades),
    truncated,
    generatedAt: new Date().toISOString(),
  };
}

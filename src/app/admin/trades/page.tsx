import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { getAdminTrades, getTradedAccounts } from "@/lib/data/admin-trades";
import { summariseTrades } from "@/lib/journal-summary";
import { formatSignedCurrency } from "@/lib/format";
import { fmtAge } from "@/lib/ops-health";
import { Tile, Panel, Table } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How many rows the log shows. Everything, per account, is in the journal. */
const LOG_LIMIT = 500;

function when(iso: string | null, timezone: string): string {
  if (!iso) return "—";
  // The trader's clock, not the operator's: a trade's day is what the daily
  // loss limit was measured against, and that is their midnight, not ours.
  return formatInTimeZone(new Date(iso), timezone, "dd MMM yyyy HH:mm");
}

export default async function AdminTradesPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const { account } = await searchParams;
  // A hand-edited query string must not reach Postgres as a malformed uuid.
  const accountId = account && UUID.test(account) ? account : undefined;

  const [accounts, trades] = await Promise.all([
    getTradedAccounts(),
    getAdminTrades({ accountId, limit: LOG_LIMIT }),
  ]);

  const selected = accountId ? accounts.find((a) => a.accountId === accountId) : undefined;
  const shown = summariseTrades(trades);
  const fleetTrades = accounts.reduce((n, a) => n + a.trades, 0);
  const manual = trades.filter((t) => t.source === "MANUAL").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Trades</h1>
        <p className="text-sm text-muted-foreground">
          Every trade reported by every account. Times are on each trader&apos;s own clock.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label="Trades on record" value={String(fleetTrades)} />
        <Tile label="Accounts trading" value={String(accounts.length)} />
        <Tile
          label={selected ? "Net P/L (account)" : "Net P/L (shown)"}
          value={formatSignedCurrency(shown.netPnl)}
          tone={shown.netPnl >= 0 ? "ok" : "down"}
        />
        <Tile
          label="Win rate (shown)"
          value={shown.closed === 0 ? "—" : `${shown.winRatePercent.toFixed(1)}%`}
          hint={`${shown.closed} closed of ${shown.total}`}
        />
        <Tile
          label="Hand-entered"
          value={String(manual)}
          tone={manual === 0 ? "ok" : "warn"}
          hint={manual === 0 ? "every row is EA-verified" : "not verified by an EA"}
        />
      </div>

      <Panel title="Accounts that have traded" note="busiest first — the journal is the whole record">
        <Table
          cols={["User", "Account", "Trades", "Last trade", "Journal"]}
          empty="No trade has been reported by anyone yet."
        >
          {accounts.map((a) => (
            <tr key={a.accountId} className={a.accountId === accountId ? "bg-muted/40" : undefined}>
              <td className="px-4 py-2">
                <div className="font-medium">{a.email}</div>
                <div className="text-xs text-muted-foreground">
                  {a.fullName ?? "—"} · {a.timezone}
                </div>
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {a.accountName}
                {a.broker ? <div className="text-xs">{a.broker}</div> : null}
              </td>
              <td className="px-4 py-2 tabular-nums">
                <Link href={`/admin/trades?account=${a.accountId}`} className="hover:underline">
                  {a.trades}
                </Link>
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                {fmtAge(a.lastEntry)}
              </td>
              <td className="px-4 py-2">
                <Link
                  href={`/admin/trades/${a.accountId}/journal`}
                  className="text-xs hover:underline"
                >
                  Journal PDF →
                </Link>
              </td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel
        title={selected ? `Trade log — ${selected.email}` : "Trade log"}
        note={
          selected
            ? `newest first · ${trades.length} shown`
            : `newest first across all accounts · ${trades.length} of ${fleetTrades}`
        }
      >
        {selected ? (
          <div className="border-b px-4 py-2 text-xs">
            <Link href="/admin/trades" className="text-muted-foreground hover:underline">
              ← all accounts
            </Link>
          </div>
        ) : null}
        <Table
          cols={[
            ...(selected ? [] : ["User"]),
            "Entry",
            "Symbol",
            "Side",
            "Qty",
            "In",
            "Out",
            "P/L",
            "Source",
            "Notes",
          ]}
          empty="Nothing matches."
        >
          {trades.map((t) => {
            const tz = t.owner?.timezone ?? "UTC";
            return (
              <tr key={t.id}>
                {selected ? null : (
                  <td className="px-4 py-2">
                    <div className="text-xs font-medium">{t.owner?.email ?? "(unknown)"}</div>
                  </td>
                )}
                <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                  {when(t.entry_time, tz)}
                </td>
                <td className="px-4 py-2 font-medium">{t.symbol}</td>
                <td className="px-4 py-2 text-muted-foreground">{t.direction}</td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">
                  {t.quantity ?? "—"}
                </td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">{t.entry_price}</td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">
                  {t.exit_price ?? "—"}
                </td>
                <td
                  className={`px-4 py-2 tabular-nums ${
                    t.pnl === null ? "text-muted-foreground" : t.pnl < 0 ? "text-red-500" : "text-emerald-500"
                  }`}
                >
                  {t.pnl === null ? "open" : formatSignedCurrency(t.pnl)}
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{t.source}</td>
                <td className="max-w-xs px-4 py-2 text-xs text-muted-foreground">
                  {t.notes || "—"}
                </td>
              </tr>
            );
          })}
        </Table>
      </Panel>
    </div>
  );
}

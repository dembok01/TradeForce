import Link from "next/link";
import { getOpsEas, getAllOutages } from "@/lib/data/admin";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { uptimePctFromGaps } from "@/lib/ops-health";
import { Tile, Panel, Table } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const DAYS = 30;

/**
 * Fleet-wide outage log, derived entirely from gaps in account_snapshots.
 *
 * This page exists because a 48-hour EA freeze over a weekend went unnoticed
 * until the following Monday. Anything that stops the heartbeat — a clock bug,
 * a 403 storm, a dead container, a trader closing MT5 — shows up here as a red
 * row with a timestamp, without needing a single new piece of telemetry.
 */
export default async function OutagesPage() {
  const [eas, raw] = await Promise.all([getOpsEas(), getAllOutages(DAYS)]);
  // null means the query failed. Showing "no outages" for that would be the
  // exact false-green this page exists to kill.
  const unavailable = raw === null;
  const outages = raw ?? [];
  const byAccount = new Map(eas.map((e) => [e.account_id, e]));

  const all = outages
    .map((o) => ({ ...o, ea: byAccount.get(o.account_id) }))
    .filter((o) => o.ea !== undefined) as (typeof outages[number] & { ea: NonNullable<ReturnType<typeof byAccount.get>> })[];

  // Uptime is derived from the same gaps rather than a second round trip per
  // account: downtime in the window over the window.
  const rows = eas.map((ea) => {
    const mine = all.filter((o) => o.account_id === ea.account_id);
    return { ea, outages: mine, uptime: uptimePctFromGaps(mine, 7 * 86400_000) };
  }).filter((r) => r.outages.length > 0);

  const totalMin = all.reduce((n, o) => n + Number(o.minutes), 0);
  const worst = all[0] ? Math.max(...all.map((o) => Number(o.minutes))) : 0;

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={60_000} />

      <div>
        <h1 className="text-2xl font-semibold">Outages</h1>
        <p className="text-sm text-muted-foreground">
          Gaps over 20 minutes in the EA heartbeat, last {DAYS} days. The EA writes a
          snapshot every ~60s, so a gap means it was not running — the user was unprotected.
        </p>
      </div>

      {unavailable ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <strong>Uptime history unavailable.</strong> The gap-analysis functions
          are missing — run <code>supabase/migrations/20260829000000_ops_views.sql</code>.
          The figures below are not &ldquo;no outages&rdquo;; they are &ldquo;not checked&rdquo;.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Outages" value={String(all.length)} tone={all.length ? "warn" : "ok"} />
        <Tile label="Accounts affected" value={`${rows.length} / ${eas.length}`} />
        <Tile label="Total downtime" value={totalMin >= 120 ? `${(totalMin / 60).toFixed(1)} h` : `${Math.round(totalMin)} min`} />
        <Tile label="Longest" value={worst >= 120 ? `${(worst / 60).toFixed(1)} h` : `${Math.round(worst)} min`}
              tone={worst > 240 ? "down" : worst ? "warn" : "ok"} />
      </div>

      <Panel title="Uptime by account" note="last 7 days">
        <Table cols={["User", "Kind", "Uptime 7d", `Outages ${DAYS}d`]}
               empty={unavailable ? "Not checked — migration missing." : "Every account has reported continuously."}>
          {rows.map((r) => (
            <tr key={r.ea.account_id}>
              <td className="px-4 py-2">
                <Link href={`/admin/instances/${r.ea.account_id}`} className="font-medium hover:underline">
                  {r.ea.email ?? r.ea.account_id.slice(0, 8)}
                </Link>
              </td>
              <td className="px-4 py-2 text-muted-foreground">{r.ea.kind}</td>
              <td className={`px-4 py-2 tabular-nums ${r.uptime < 95 ? "font-semibold text-red-500" : ""}`}>
                {`${r.uptime}%`}
              </td>
              <td className="px-4 py-2 tabular-nums">{r.outages.length}</td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel title="Every outage" note="newest first">
        <Table cols={["Started", "Ended", "Duration", "User"]}
               empty={unavailable ? "Not checked — migration missing." : "No outages recorded."}>
          {all.map((o, n) => (
            <tr key={n} className={Number(o.minutes) > 240 ? "bg-red-500/5" : undefined}>
              <td className="whitespace-nowrap px-4 py-2">{new Date(o.started_at).toLocaleString()}</td>
              <td className="whitespace-nowrap px-4 py-2">{new Date(o.ended_at).toLocaleString()}</td>
              <td className="px-4 py-2 tabular-nums">
                {Number(o.minutes) >= 120 ? `${(Number(o.minutes) / 60).toFixed(1)} h` : `${o.minutes} min`}
              </td>
              <td className="px-4 py-2">
                <Link href={`/admin/instances/${o.ea.account_id}`} className="hover:underline">
                  {o.ea.email ?? o.ea.account_id.slice(0, 8)}
                </Link>
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );
}

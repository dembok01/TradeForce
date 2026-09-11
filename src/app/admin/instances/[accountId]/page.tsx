import Link from "next/link";
import { notFound } from "next/navigation";
import { getEaDetail } from "@/lib/data/admin";
import { eaHealth, serverHealth, fmtAge } from "@/lib/ops-health";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { Dot, Tile, Panel, Table, Facts, Cmd } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 7;

/**
 * Uptime as a 7-day strip. Each red segment is a real gap in account_snapshots,
 * which the EA writes every ~60s — so a gap is proof the EA was not running.
 * This is the view that would have made the 48-hour weekend clock freeze
 * obvious on the Saturday instead of the following Monday.
 */
function UptimeStrip({ outages, now }: {
  outages: { started_at: string; ended_at: string }[]; now: number;
}) {
  const start = now - WINDOW_DAYS * 86400_000;
  const span = now - start;

  return (
    <div className="px-4 py-4">
      <div className="relative h-8 overflow-hidden rounded bg-emerald-500/70">
        {outages.map((o, n) => {
          const s = Math.max(new Date(o.started_at).getTime(), start);
          const e = Math.min(new Date(o.ended_at).getTime(), now);
          if (e <= s) return null;
          return (
            <span key={n} className="absolute inset-y-0 bg-red-500"
                  style={{ left: `${((s - start) / span) * 100}%`, width: `${Math.max(((e - s) / span) * 100, 0.3)}%` }} />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{WINDOW_DAYS} days ago</span><span>now</span>
      </div>
    </div>
  );
}

/** Equity over the last ~4 hours of snapshots. Enough to spot a drawdown event. */
function Equity({ points }: { points: { equity: number; recorded_at: string }[] }) {
  if (points.length < 2) return <p className="px-4 py-6 text-sm text-muted-foreground">Not enough snapshots yet.</p>;
  const vals = points.map((p) => p.equity);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const range = hi - lo || 1;
  const d = points
    .map((p, i) => `${(i / (points.length - 1)) * 100},${30 - ((p.equity - lo) / range) * 28}`)
    .join(" ");
  return (
    <div className="px-4 py-4">
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-24 w-full">
        <polyline points={d} fill="none" stroke="currentColor" strokeWidth="0.5" className="text-primary" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>{fmtAge(points[0].recorded_at)}</span>
        <span>{lo.toFixed(2)} – {hi.toFixed(2)}</span>
        <span>now {vals[vals.length - 1].toFixed(2)}</span>
      </div>
    </div>
  );
}

export default async function EaDetailPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const d = await getEaDetail(accountId);
  if (!d) notFound();

  const { now, ea, profile, account, rules, server, uptime7d, outages, violations, trades, events, snapshots } = d;
  const cloud = ea.kind === "cloud";
  const h = cloud ? eaHealth(ea.eaLastSeenAt, ea.desired_state ?? "running") : "idle";
  const container = `tf-${ea.mt5_login ?? ""}`;
  const recent = (outages ?? []).filter((o) => new Date(o.ended_at).getTime() > now - WINDOW_DAYS * 86400_000);

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={30_000} />

      <div>
        <Link href="/admin/instances" className="text-sm text-muted-foreground hover:underline">← EAs</Link>
        <h1 className="mt-1 text-2xl font-semibold">{profile?.email ?? ea.account_id.slice(0, 8)}</h1>
        <p className="text-sm text-muted-foreground">
          {cloud ? "Cloud instance" : "Desktop EA"} · account {ea.account_id}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="EA" value={cloud ? h : fmtAge(ea.eaLastSeenAt)} tone={cloud ? h : undefined}
              hint={cloud ? `last sync ${fmtAge(ea.eaLastSeenAt)}` : "desktop terminal"} />
        <Tile label={`Uptime ${WINDOW_DAYS}d`} value={uptime7d === null ? "—" : `${uptime7d}%`}
              tone={uptime7d === null ? undefined : uptime7d > 99 ? "ok" : uptime7d > 95 ? "warn" : "down"}
              hint="from snapshot gaps" />
        <Tile label="Outages 30d" value={outages === null ? "—" : String(outages.length)}
              tone={outages === null ? undefined : outages.length === 0 ? "ok" : "warn"}
              hint={outages === null ? "uptime query unavailable" : undefined}
              href="/admin/outages" />
        <Tile label="Violations" value={String(violations.length)} hint="most recent 25" />
      </div>

      <Panel title={`Uptime — last ${WINDOW_DAYS} days`}
             note="green = EA reporting, red = silent">
        <UptimeStrip outages={recent} now={now} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Account">
          <Facts rows={[
            ["Email", profile?.email ?? "—"],
            ["Name", profile?.full_name ?? "—"],
            ["Timezone", profile?.timezone ?? "—"],
            ["Prop firm", profile?.prop_firm ?? "—"],
            ["Account", account ? `${account.name}${account.is_primary ? " (primary)" : ""}` : "—"],
            ["Broker", account?.broker ?? "—"],
            ["Balance", account
              ? `${account.current_equity?.toFixed(2) ?? "—"} of ${account.starting_balance?.toFixed(2) ?? "—"} start`
              : "—"],
            ["Signed up", profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "—"],
            ["User ID", <span key="u" className="font-mono text-xs">{ea.user_id}</span>],
            ["Account ID", <span key="a" className="font-mono text-xs">{ea.account_id}</span>],
          ]} />
        </Panel>

        <Panel title={cloud ? "MT5 instance" : "EA"}>
          <Facts rows={cloud ? [
            ["MT5 login", ea.mt5_login],
            ["Broker server", ea.mt5_server],
            ["Pool host", server
              ? <span key="s"><Dot h={serverHealth(server.last_seen_at)} /> {ea.server_host}</span>
              : ea.server_host],
            ["Desired state", ea.desired_state],
            ["Agent status", `${ea.status ?? "—"}${ea.status_detail ? ` — ${ea.status_detail}` : ""}`],
            ["Container up", ea.started_at ? fmtAge(ea.started_at).replace(" ago", "") : "—"],
            ["Restarts", String(ea.restarts ?? 0)],
            ["CPU / RAM", `${ea.cpu_cores ?? "—"} cores · ${ea.mem_mb ?? "—"} MB`],
          ] : [
            ["Runs on", "The trader's own PC"],
            ["Last seen", fmtAge(ea.eaLastSeenAt)],
            ["Note", "No container to inspect. If this is silent, MT5 is closed or the EA was removed."],
          ]} />
        </Panel>

        <Panel title="EA telemetry" note="reported by the EA itself">
          <Facts rows={[
            ["Version", ea.ea_version ?? "not reported (pre-v1.23)"],
            ["Failed fetches", String(ea.ea_failed_fetches ?? "—")],
            ["Last HTTP status", String(ea.ea_last_http_status ?? "—")],
            ["Queued posts", String(ea.ea_queued_posts ?? "—")],
            ["Serving from cache", ea.ea_from_cache === null ? "—" : ea.ea_from_cache ? "yes — config is stale" : "no"],
            ["Backoff", ea.ea_backoff_seconds ? `${ea.ea_backoff_seconds}s` : "none"],
          ]} />
        </Panel>

        <Panel title="Rules in force">
          {rules ? (
            <Facts rows={Object.entries(rules)
              .filter(([k]) => !["id", "account_id", "created_at", "updated_at"].includes(k))
              .map(([k, v]) => [k.replace(/_/g, " "), String(v ?? "—")] as [string, React.ReactNode])} />
          ) : <p className="px-4 py-6 text-sm text-muted-foreground">No rules configured.</p>}
        </Panel>
      </div>

      <Panel title="Equity" note="last 240 snapshots">
        <Equity points={snapshots} />
      </Panel>

      <Panel title={`Outages — last 30 days`} note="gaps over 20 minutes in the EA heartbeat">
        <Table cols={["Started", "Ended", "Duration"]}
               empty={outages === null
                 ? "Uptime history unavailable — run migration 20260829000000_ops_views.sql."
                 : "No gaps. The EA has reported continuously."}>
          {(outages ?? []).map((o, n) => (
            <tr key={n}>
              <td className="whitespace-nowrap px-4 py-2">{new Date(o.started_at).toLocaleString()}</td>
              <td className="whitespace-nowrap px-4 py-2">{new Date(o.ended_at).toLocaleString()}</td>
              <td className="px-4 py-2 tabular-nums">
                {o.minutes >= 120 ? `${(o.minutes / 60).toFixed(1)} h` : `${o.minutes} min`}
              </td>
            </tr>
          ))}
        </Table>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Violations">
          <Table cols={["When", "Type"]} empty="None recorded.">
            {violations.map((v) => (
              <tr key={v.id}>
                <td className="whitespace-nowrap px-4 py-2">{new Date(v.occurred_at).toLocaleString()}</td>
                <td className="px-4 py-2">{v.type}</td>
              </tr>
            ))}
          </Table>
        </Panel>

        <Panel title="EA events">
          <Table cols={["When", "Event"]} empty="None recorded.">
            {events.map((e, n) => (
              <tr key={n}>
                <td className="whitespace-nowrap px-4 py-2">{new Date(e.occurred_at).toLocaleString()}</td>
                <td className="px-4 py-2">{e.event_type}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      </div>

      <Panel title="Recent trades">
        <Table cols={["Closed", "Symbol", "P/L"]} empty="No closed trades.">
          {trades.map((t) => (
            <tr key={t.id}>
              <td className="whitespace-nowrap px-4 py-2">{t.exit_time ? new Date(t.exit_time).toLocaleString() : "open"}</td>
              <td className="px-4 py-2">{t.symbol ?? "—"}</td>
              <td className={`px-4 py-2 tabular-nums ${(t.pnl ?? 0) < 0 ? "text-red-500" : ""}`}>
                {t.pnl?.toFixed(2) ?? "—"}
              </td>
            </tr>
          ))}
        </Table>
      </Panel>

      {cloud && ea.server_host ? (
        <Panel title="Ops commands" note="paste into your own terminal — the console never runs these">
          <div className="space-y-3 px-4 py-4">
            <Cmd>{`ssh root@${ea.server_host} 'docker logs --tail 100 ${container}'`}</Cmd>
            <Cmd>{`ssh root@${ea.server_host} "tail -100 /srv/${container}/wine/drive_c/Program\\ Files/MetaTrader\\ 5/MQL5/Logs/*.log"`}</Cmd>
            <Cmd>{`ssh root@${ea.server_host} 'docker restart ${container}'`}</Cmd>
            <Cmd>{`ssh root@${ea.server_host} 'journalctl -u tf-agent -n 100 --no-pager'`}</Cmd>
            <p className="text-xs text-muted-foreground">
              Restarting is safe: the EA re-reads its config on start and any queued
              reports are replayed. It costs the user ~40s of unprotected time.
            </p>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

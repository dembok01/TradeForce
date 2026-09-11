import Link from "next/link";
import { getPoolServers, getOpsEas } from "@/lib/data/admin";
import {
  eaHealth, serverHealth, fmtAge, ageMs,
  FAILED_FETCH_ALERT, type Health,
} from "@/lib/ops-health";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { Dot, Tile, Panel, Table } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [servers, eas] = await Promise.all([getPoolServers(), getOpsEas()]);

  const cloud = eas.filter((e) => e.kind === "cloud");
  const desktop = eas.filter((e) => e.kind === "desktop");
  const running = cloud.filter((e) => e.desired_state === "running");
  const healthy = running.filter((e) => eaHealth(e.eaLastSeenAt, "running") === "ok");
  const serversUp = servers.filter((s) => serverHealth(s.last_seen_at) === "ok");
  const capacity = servers.reduce((n, s) => n + (s.capacity ?? 0), 0);

  // Alerts, most urgent first. Everything here is actionable; nothing is FYI.
  const alerts: { level: Health; text: string; href?: string }[] = [];
  for (const s of servers) {
    if (serverHealth(s.last_seen_at) === "down") {
      alerts.push({ level: "down", href: "/admin/servers",
        text: `Pool server ${s.host} last reported ${fmtAge(s.last_seen_at)} — every instance on it is unmonitored.` });
    }
    if ((s.disk_free_mb ?? Infinity) < 15_000) {
      alerts.push({ level: "warn", href: "/admin/servers",
        text: `${s.host}: only ${Math.round((s.disk_free_mb ?? 0) / 1024)} GB free — provisioning fails silently without space.` });
    }
    if (s.capacity && s.instances >= s.capacity * 0.8) {
      alerts.push({ level: "warn", href: "/admin/servers",
        text: `${s.host} at ${s.instances}/${s.capacity} capacity — order the next server.` });
    }
  }
  for (const e of running) {
    const h = eaHealth(e.eaLastSeenAt, "running");
    const who = e.email ?? e.account_id.slice(0, 8);
    if (h === "down") {
      alerts.push({ level: "down", href: `/admin/instances/${e.account_id}`,
        text: `${who} — EA silent ${fmtAge(e.eaLastSeenAt)} while marked running. User is unprotected.` });
    }
    if ((e.ea_failed_fetches ?? 0) > FAILED_FETCH_ALERT) {
      alerts.push({ level: "warn", href: `/admin/instances/${e.account_id}`,
        text: `${who} — ${e.ea_failed_fetches} failed fetches (last status ${e.ea_last_http_status ?? "?"}). Possible retry storm.` });
    }
  }
  // Desktop EAs can't be restarted by us, but silence still means unprotected.
  for (const e of desktop) {
    const ms = ageMs(e.eaLastSeenAt);
    if (ms !== null && ms > 24 * 3600_000) {
      alerts.push({ level: "warn", href: `/admin/instances/${e.account_id}`,
        text: `${e.email ?? e.account_id.slice(0, 8)} — desktop EA last seen ${fmtAge(e.eaLastSeenAt)}. Terminal is off, or they removed it.` });
    }
  }
  alerts.sort((a, b) => (a.level === "down" ? -1 : 1) - (b.level === "down" ? -1 : 1));

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={30_000} />

      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground">Internal only. Refreshes every 30s.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Cloud EAs healthy" value={`${healthy.length} / ${running.length}`}
              tone={healthy.length === running.length ? "ok" : "down"} href="/admin/instances" />
        <Tile label="Desktop EAs" value={String(desktop.length)}
              hint="we can't restart these" href="/admin/instances" />
        <Tile label="Servers up" value={`${serversUp.length} / ${servers.length}`}
              tone={serversUp.length === servers.length ? "ok" : "down"} href="/admin/servers" />
        <Tile label="Capacity used" value={capacity ? `${running.length} / ${capacity}` : "—"}
              href="/admin/servers" />
      </div>

      <Panel title="Alerts">
        {alerts.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nothing needs attention.</p>
        ) : (
          <ul className="divide-y">
            {alerts.map((a, n) => (
              <li key={n} className="flex items-start gap-3 px-4 py-3 text-sm">
                <span className="mt-1.5"><Dot h={a.level} /></span>
                {a.href ? <Link href={a.href} className="hover:underline">{a.text}</Link> : <span>{a.text}</span>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Pool servers">
        <Table cols={["Host", "Seen", "Instances", "RAM free", "Disk free", "Image", "Agent"]}
               empty="No pool server has reported yet — the agent needs the telemetry update.">
          {servers.map((s) => (
            <tr key={s.host}>
              <td className="px-4 py-2 font-medium">
                <Link href="/admin/servers" className="hover:underline">{s.host}</Link>
              </td>
              <td className="whitespace-nowrap px-4 py-2">
                <Dot h={serverHealth(s.last_seen_at)} /> {fmtAge(s.last_seen_at)}
              </td>
              <td className="px-4 py-2 tabular-nums">{s.instances}{s.capacity ? ` / ${s.capacity}` : ""}</td>
              <td className="px-4 py-2 tabular-nums">{s.ram_free_mb ? `${(s.ram_free_mb / 1024).toFixed(1)} GB` : "—"}</td>
              <td className="px-4 py-2 tabular-nums">{s.disk_free_mb ? `${Math.round(s.disk_free_mb / 1024)} GB` : "—"}</td>
              <td className="px-4 py-2 text-muted-foreground">{s.image_tag ?? "—"}</td>
              <td className="px-4 py-2 text-muted-foreground">{s.agent_version ?? "—"}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );
}

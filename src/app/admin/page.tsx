import { getPoolServers, getOpsInstances } from "@/lib/data/admin";
import {
  eaHealth, serverHealth, fmtAge, ageMs,
  FAILED_FETCH_ALERT, type Health,
} from "@/lib/ops-health";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";

export const dynamic = "force-dynamic";

const DOT: Record<Health, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  down: "bg-red-500",
  idle: "bg-muted-foreground/40",
};

function Dot({ h }: { h: Health }) {
  return <span className={`inline-block size-2 rounded-full ${DOT[h]}`} aria-hidden />;
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: Health }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-2 text-2xl font-semibold tabular-nums">
        {tone ? <Dot h={tone} /> : null}
        {value}
      </div>
    </div>
  );
}

export default async function AdminPage() {
  const [servers, instances] = await Promise.all([getPoolServers(), getOpsInstances()]);

  const running = instances.filter((i) => i.desired_state === "running");
  const healthy = running.filter((i) => eaHealth(i.eaLastSeenAt, i.desired_state) === "ok");
  const serversUp = servers.filter((s) => serverHealth(s.last_seen_at) === "ok");
  const capacity = servers.reduce((n, s) => n + (s.capacity ?? 0), 0);

  // Alerts, most urgent first. Everything here is actionable; nothing is FYI.
  const alerts: { level: Health; text: string }[] = [];
  for (const s of servers) {
    if (serverHealth(s.last_seen_at) === "down") {
      alerts.push({
        level: "down",
        text: `Pool server ${s.host} last reported ${fmtAge(s.last_seen_at)} — every instance on it is unmonitored.`,
      });
    }
    if ((s.disk_free_mb ?? Infinity) < 15_000) {
      alerts.push({ level: "warn", text: `${s.host}: only ${Math.round((s.disk_free_mb ?? 0) / 1024)} GB free — provisioning fails silently without space.` });
    }
    if (s.capacity && s.instances >= s.capacity * 0.8) {
      alerts.push({ level: "warn", text: `${s.host} at ${s.instances}/${s.capacity} capacity — order the next server.` });
    }
  }
  for (const i of running) {
    const h = eaHealth(i.eaLastSeenAt, i.desired_state);
    if (h === "down") {
      alerts.push({ level: "down", text: `${i.email ?? i.account_id.slice(0, 8)} — EA silent ${fmtAge(i.eaLastSeenAt)} while marked running. User is unprotected.` });
    }
    if ((i.ea_failed_fetches ?? 0) > FAILED_FETCH_ALERT) {
      alerts.push({ level: "warn", text: `${i.email ?? i.account_id.slice(0, 8)} — ${i.ea_failed_fetches} failed fetches (last status ${i.ea_last_http_status ?? "?"}). Possible retry storm.` });
    }
  }
  alerts.sort((a, b) => (a.level === "down" ? -1 : 1) - (b.level === "down" ? -1 : 1));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <AutoRefresh intervalMs={30_000} />

      <div>
        <h1 className="text-2xl font-semibold">Ops console</h1>
        <p className="text-sm text-muted-foreground">
          Internal only. Refreshes every 30s.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Instances healthy" value={`${healthy.length} / ${running.length}`}
              tone={healthy.length === running.length ? "ok" : "down"} />
        <Tile label="Servers up" value={`${serversUp.length} / ${servers.length}`}
              tone={serversUp.length === servers.length ? "ok" : "down"} />
        <Tile label="Capacity used" value={capacity ? `${running.length} / ${capacity}` : "—"} />
        <Tile label="Alerts" value={String(alerts.length)}
              tone={alerts.length ? (alerts[0].level === "down" ? "down" : "warn") : "ok"} />
      </div>

      <section className="rounded-lg border">
        <h2 className="border-b px-4 py-3 text-sm font-medium">Alerts</h2>
        {alerts.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Nothing needs attention.
          </p>
        ) : (
          <ul className="divide-y">
            {alerts.map((a, n) => (
              <li key={n} className="flex items-start gap-3 px-4 py-3 text-sm">
                <span className="mt-1.5"><Dot h={a.level} /></span>
                <span>{a.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border">
        <h2 className="border-b px-4 py-3 text-sm font-medium">Pool servers</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {["Host", "Seen", "Instances", "CPU", "RAM free", "Disk free", "Load", "Image", "Agent"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {servers.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-6 text-muted-foreground">
                  No pool server has reported yet — the agent needs the telemetry update.
                </td></tr>
              ) : servers.map((s) => {
                const used = instances
                  .filter((i) => i.server_host === s.host)
                  .reduce((n, i) => n + (i.cpu_cores ?? 0), 0);
                return (
                  <tr key={s.host}>
                    <td className="px-4 py-2 font-medium">{s.host}</td>
                    <td className="whitespace-nowrap px-4 py-2">
                      <Dot h={serverHealth(s.last_seen_at)} /> {fmtAge(s.last_seen_at)}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{s.instances}{s.capacity ? ` / ${s.capacity}` : ""}</td>
                    <td className="px-4 py-2 tabular-nums">{used ? `${used.toFixed(1)} / ${s.cores ?? "?"}` : "—"}</td>
                    <td className="px-4 py-2 tabular-nums">{s.ram_free_mb ? `${(s.ram_free_mb / 1024).toFixed(1)} GB` : "—"}</td>
                    <td className="px-4 py-2 tabular-nums">{s.disk_free_mb ? `${Math.round(s.disk_free_mb / 1024)} GB` : "—"}</td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">{s.load_1m ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{s.image_tag ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{s.agent_version ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border">
        <h2 className="border-b px-4 py-3 text-sm font-medium">
          Instances
          <span className="ml-2 font-normal text-muted-foreground">
            — when &ldquo;Agent&rdquo; and &ldquo;EA&rdquo; disagree, trust the EA
          </span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {["User", "MT5", "Server", "Agent", "EA", "Last sync", "Fails", "HTTP", "Queue", "CPU", "Mem", "Up", "Ver"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {instances.length === 0 ? (
                <tr><td colSpan={13} className="px-4 py-6 text-muted-foreground">No cloud instances.</td></tr>
              ) : instances.map((i) => {
                const h = eaHealth(i.eaLastSeenAt, i.desired_state);
                const disagrees = i.status === "running" && h === "down";
                return (
                  <tr key={i.account_id} className={disagrees ? "bg-red-500/5" : undefined}>
                    <td className="px-4 py-2">{i.email ?? i.account_id.slice(0, 8)}</td>
                    <td className="px-4 py-2 tabular-nums">{i.mt5_login}</td>
                    <td className="px-4 py-2 text-muted-foreground">{i.mt5_server}</td>
                    <td className="px-4 py-2">{i.status}</td>
                    <td className="whitespace-nowrap px-4 py-2"><Dot h={h} /> {h}</td>
                    <td className="whitespace-nowrap px-4 py-2">{fmtAge(i.eaLastSeenAt)}</td>
                    <td className={`px-4 py-2 tabular-nums ${(i.ea_failed_fetches ?? 0) > FAILED_FETCH_ALERT ? "font-semibold text-red-500" : ""}`}>
                      {i.ea_failed_fetches ?? "—"}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">{i.ea_last_http_status ?? "—"}</td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">{i.ea_queued_posts ?? "—"}</td>
                    <td className="px-4 py-2 tabular-nums">{i.cpu_cores ?? "—"}</td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">{i.mem_mb ? `${i.mem_mb}M` : "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                      {i.started_at ? fmtAge(i.started_at).replace(" ago", "") : "—"}
                      {i.restarts > 0 ? ` (${i.restarts}✕)` : ""}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{i.ea_version ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

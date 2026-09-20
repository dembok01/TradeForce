import Link from "next/link";
import { getPoolServers, getOpsEas } from "@/lib/data/admin";
import { serverHealth, fmtAge, diskHeadroomUsers } from "@/lib/ops-health";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { Dot, Panel, Table, Facts, Cmd } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

// Measured, not guessed: 8 instances ran on 4 cores under concurrency.
// Anything above this is oversubscribed, whatever the load average says.
const USERS_PER_CORE = 2.0;

export default async function ServersPage() {
  const [servers, eas] = await Promise.all([getPoolServers(), getOpsEas()]);

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={30_000} />

      <div>
        <h1 className="text-2xl font-semibold">Pool servers</h1>
        <p className="text-sm text-muted-foreground">
          Reported by the tf-agent on each host every 15s.
        </p>
      </div>

      {servers.length === 0 ? (
        <Panel title="No servers">
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No pool server has reported yet — the agent needs the telemetry update.
          </p>
        </Panel>
      ) : servers.map((s) => {
        const mine = eas.filter((e) => e.server_host === s.host);
        const usedCores = mine.reduce((n, e) => n + (e.cpu_cores ?? 0), 0);
        const headroom = s.cores ? Math.floor(s.cores * USERS_PER_CORE) - mine.length : null;
        const diskRoom = diskHeadroomUsers(s.disk_free_mb);

        return (
          <Panel key={s.host} title={s.host}
                 note={serverHealth(s.last_seen_at) === "ok" ? `reporting, ${fmtAge(s.last_seen_at)}` : `SILENT ${fmtAge(s.last_seen_at)}`}>
            <div className="grid gap-6 border-b lg:grid-cols-2">
              <Facts rows={[
                ["Status", <span key="s"><Dot h={serverHealth(s.last_seen_at)} /> {fmtAge(s.last_seen_at)}</span>],
                ["Cores", s.cores ?? "—"],
                ["RAM", s.ram_total_mb
                  ? `${((s.ram_free_mb ?? 0) / 1024).toFixed(1)} GB free of ${(s.ram_total_mb / 1024).toFixed(1)} GB`
                  : "—"],
                ["Disk free", s.disk_free_mb ? `${Math.round(s.disk_free_mb / 1024)} GB` : "—"],
              ]} />
              <Facts rows={[
                ["Instances", `${s.instances}${s.capacity ? ` / ${s.capacity}` : ""}`],
                ["CPU in use", usedCores ? `${usedCores.toFixed(1)} of ${s.cores ?? "?"} cores` : "—"],
                ["Room for (CPU)", headroom === null ? "—" : `${headroom} more users (at ${USERS_PER_CORE}/core, measured)`],
                ["Room for (disk)", diskRoom === null ? "—" : `${diskRoom} more users (~3 GB each, 8 GB held back)`],
                ["Image / agent", `${s.image_tag ?? "—"} · ${s.agent_version ?? "—"}`],
              ]} />
            </div>

            <Table cols={["User", "MT5", "Broker", "Last sync", "CPU", "Mem", "Restarts"]}
                   empty="No instances on this host.">
              {mine.map((e) => (
                <tr key={e.account_id}>
                  <td className="px-4 py-2">
                    <Link href={`/admin/instances/${e.account_id}`} className="font-medium hover:underline">
                      {e.email ?? e.account_id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-2 tabular-nums">{e.mt5_login}</td>
                  <td className="px-4 py-2 text-muted-foreground">{e.mt5_server}</td>
                  <td className="whitespace-nowrap px-4 py-2">{fmtAge(e.eaLastSeenAt)}</td>
                  <td className="px-4 py-2 tabular-nums">{e.cpu_cores ?? "—"}</td>
                  <td className="px-4 py-2 tabular-nums text-muted-foreground">{e.mem_mb ? `${e.mem_mb}M` : "—"}</td>
                  <td className="px-4 py-2 tabular-nums">{e.restarts ?? 0}</td>
                </tr>
              ))}
            </Table>

            <div className="space-y-2 border-t px-4 py-4">
              <Cmd>{`ssh root@${s.host} 'systemctl status tf-agent && docker ps'`}</Cmd>
              <p className="text-xs text-muted-foreground">
                Load average is deliberately not shown: we measured 14.01 on this
                4-core box with every EA healthy and iowait at zero. Judge capacity
                by instances and cgroup CPU, never by load.
              </p>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

import Link from "next/link";
import { getOpsEas } from "@/lib/data/admin";
import { eaHealth, desktopHealth, fmtAge, FAILED_FETCH_ALERT } from "@/lib/ops-health";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { Dot, Panel, Table } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function InstancesPage() {
  const eas = await getOpsEas();

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={30_000} />

      <div>
        <h1 className="text-2xl font-semibold">EAs</h1>
        <p className="text-sm text-muted-foreground">
          Every account with a live API key, cloud or desktop. Click a row for the full picture.
        </p>
      </div>

      <Panel title="Cloud" note="we run these; when Agent and EA disagree, trust the EA">
        <Table cols={["User", "MT5", "Broker", "Agent", "EA", "Last sync", "Fails", "HTTP", "Queue", "CPU", "Mem", "Up", "Ver"]}
               empty="No cloud instances.">
          {eas.filter((e) => e.kind === "cloud").map((e) => {
            const h = eaHealth(e.eaLastSeenAt, e.desired_state ?? "running");
            const disagrees = e.status === "running" && h === "down";
            return (
              <tr key={e.account_id} className={disagrees ? "bg-red-500/5" : undefined}>
                <td className="px-4 py-2">
                  <Link href={`/admin/instances/${e.account_id}`} className="font-medium hover:underline">
                    {e.email ?? e.account_id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-4 py-2 tabular-nums">{e.mt5_login}</td>
                <td className="px-4 py-2 text-muted-foreground">{e.mt5_server}</td>
                <td className="px-4 py-2">{e.status}</td>
                <td className="whitespace-nowrap px-4 py-2"><Dot h={h} /> {h}</td>
                <td className="whitespace-nowrap px-4 py-2">{fmtAge(e.eaLastSeenAt)}</td>
                <td className={`px-4 py-2 tabular-nums ${(e.ea_failed_fetches ?? 0) > FAILED_FETCH_ALERT ? "font-semibold text-red-500" : ""}`}>
                  {e.ea_failed_fetches ?? "—"}
                </td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">{e.ea_last_http_status ?? "—"}</td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">{e.ea_queued_posts ?? "—"}</td>
                <td className="px-4 py-2 tabular-nums">{e.cpu_cores ?? "—"}</td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">{e.mem_mb ? `${e.mem_mb}M` : "—"}</td>
                <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                  {e.started_at ? fmtAge(e.started_at).replace(" ago", "") : "—"}
                  {(e.restarts ?? 0) > 0 ? ` (${e.restarts}✕)` : ""}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{e.ea_version ?? "—"}</td>
              </tr>
            );
          })}
        </Table>
      </Panel>

      <Panel title="Desktop" note="the trader's own terminal — we can see it, we can't restart it">
        <Table cols={["User", "EA", "Last seen", "Account"]} empty="No desktop EAs.">
          {eas.filter((e) => e.kind === "desktop").map((e) => {
            const h = desktopHealth(e.eaLastSeenAt);
            return (
              <tr key={e.account_id}>
                <td className="px-4 py-2">
                  <Link href={`/admin/instances/${e.account_id}`} className="font-medium hover:underline">
                    {e.email ?? e.account_id.slice(0, 8)}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-2"><Dot h={h} /> {h}</td>
                <td className="whitespace-nowrap px-4 py-2">{fmtAge(e.eaLastSeenAt)}</td>
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{e.account_id.slice(0, 8)}</td>
              </tr>
            );
          })}
        </Table>
      </Panel>
    </div>
  );
}

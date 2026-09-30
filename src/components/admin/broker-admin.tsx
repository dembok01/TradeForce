"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  adminSaveBrokerAction,
  adminSetBrokerEnabledAction,
  adminProbeBrokerAction,
  adminFindBrokerServersAction,
} from "@/lib/actions/admin";
import { Panel, Table } from "@/components/admin/ui";
import type { BrokerRow, DiscoveredServer, Probe } from "@/lib/data/brokers";
import type { InboxItem } from "@/lib/data/admin";

const EMPTY = { broker: "", label: "", address: "", kind: "demo" as "demo" | "live", help: "", note: "" };
type Draft = typeof EMPTY & { id?: number; verifiedServer?: string };

const field = "w-full rounded border bg-background px-2 py-1 text-sm";
const button = "rounded border px-2 py-1 text-xs whitespace-nowrap disabled:opacity-50 hover:bg-muted/60";

function ago(iso: string | null): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days}d ago`;
}

/** What the last check found, in the admin's words rather than the column's. */
function verdict(p: Probe | undefined): { text: string; tone: string; title?: string } {
  if (!p) return { text: "not checked", tone: "text-muted-foreground" };
  if (p.status !== "done") return { text: "checking…", tone: "text-muted-foreground" };
  if (p.result === "reached") {
    return { text: "answers as MT5", tone: "text-emerald-600", title: p.evidence ?? undefined };
  }
  if (p.result === "not_reached") {
    return { text: "nothing there", tone: "text-destructive", title: p.evidence ?? undefined };
  }
  return { text: "check failed", tone: "text-destructive", title: p.evidence ?? undefined };
}

export function BrokerAdmin({
  rows,
  discovered,
  probes,
  requests,
}: {
  rows: BrokerRow[];
  discovered: DiscoveredServer[];
  probes: Probe[];
  requests: InboxItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [domain, setDomain] = useState("");

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  function save() {
    startTransition(async () => {
      const r = await adminSaveBrokerAction({
        ...draft,
        help: draft.help || undefined,
        note: draft.note || undefined,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      // Saving also queues a check, so say that rather than a bare "saved".
      if (r.pending) toast.info(r.pending);
      else toast.success(draft.id ? "Server updated." : "Server added to the picker.");
      setDraft(EMPTY);
      router.refresh();
    });
  }

  function check(address: string) {
    startTransition(async () => {
      const r = await adminProbeBrokerAction(address);
      if (r.error) toast.error(r.error);
      else if (r.pending) toast.info(r.pending);
      router.refresh();
    });
  }

  function findServers(forDomain: string) {
    startTransition(async () => {
      const r = await adminFindBrokerServersAction(forDomain);
      if (r.error) toast.error(r.error);
      else if (r.pending) toast.info(r.pending);
      router.refresh();
    });
  }

  function toggle(id: number, enabled: boolean) {
    startTransition(async () => {
      const r = await adminSetBrokerEnabledAction(id, enabled);
      if (r.error) toast.error(r.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {requests.length > 0 ? (
        <Panel
          title="Traders waiting for a broker"
          note="they asked for these from the Connect page; the server name is what their broker gave them"
        >
          <Table cols={["Broker", "Their server name", "Who", "Asked", ""]}>
            {requests.map((q) => (
              <tr key={q.id}>
                <td className="px-4 py-2 font-medium">{q.broker ?? "—"}</td>
                <td className="px-4 py-2">{q.serverName ?? "not given"}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{q.email}</td>
                <td className="px-4 py-2 text-muted-foreground">{ago(q.createdAt)}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    className={button}
                    disabled={pending}
                    onClick={() => {
                      setDraft({ ...EMPTY, broker: q.broker ?? "", label: q.serverName ?? "" });
                      setDomain("");
                    }}
                  >
                    Start adding
                  </button>
                </td>
              </tr>
            ))}
          </Table>
          <p className="px-4 pb-3 text-xs text-muted-foreground">
            Mark a request handled from the Inbox once its broker is in the picker.
          </p>
        </Panel>
      ) : null}

      <Panel
        title="Find a broker's servers"
        note="tries the fifteen addresses brokers usually use, then checks what answers"
      >
        <div className="flex flex-wrap items-center gap-2 p-4">
          <input
            className={`${field} max-w-xs`}
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="tickmill.com"
            onKeyDown={(e) => {
              if (e.key === "Enter" && domain) findServers(domain);
            }}
          />
          <button className={button} disabled={pending || !domain} onClick={() => findServers(domain)}>
            {pending ? "…" : "Find servers"}
          </button>
          <span className="text-xs text-muted-foreground">
            Works for about four brokers in ten — the rest do not follow the common naming, and their
            support can give you the address.
          </span>
        </div>
      </Panel>

      {discovered.length > 0 ? (
        <Panel
          title="Found from traders"
          note="already proven - a trader signed in through these, so MetaTrader confirmed the broker answered"
        >
          <Table cols={["Address", "Server it reported", "Accounts", "Last seen", ""]}>
            {discovered.map((d) => (
              <tr key={d.address}>
                <td className="px-4 py-2 font-mono text-xs">{d.address}</td>
                <td className="px-4 py-2">{d.server ?? "—"}</td>
                <td className="px-4 py-2">{d.accounts}</td>
                <td className="px-4 py-2 text-muted-foreground">{ago(d.lastSeen)}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    className={button}
                    disabled={pending}
                    onClick={() =>
                      setDraft({
                        ...EMPTY,
                        // The server name the broker reported is the best label
                        // we have, and it is what the trader sees in MetaTrader.
                        broker: (d.server ?? "").split("-")[0] || "",
                        label: d.server ?? "Main server",
                        address: d.address,
                        kind: /demo|trial/i.test(d.server ?? "") ? "demo" : "live",
                        verifiedServer: d.server ?? undefined,
                      })
                    }
                  >
                    Use this
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        </Panel>
      ) : null}

      <Panel
        title={draft.id ? "Edit server" : "Add a server"}
        note="the broker's access point, like mt5-demo.yourbroker.com:443 - not the server name"
      >
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Broker</span>
            <input className={field} value={draft.broker} onChange={set("broker")} placeholder="IC Markets" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Which server</span>
            <input className={field} value={draft.label} onChange={set("label")} placeholder="Demo" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Address</span>
            <input
              className={`${field} font-mono`}
              value={draft.address}
              onChange={set("address")}
              placeholder="mt5-demo.icmarkets.com:443"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Demo or live</span>
            <select className={field} value={draft.kind} onChange={set("kind")}>
              <option value="demo">demo</option>
              <option value="live">live</option>
            </select>
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-muted-foreground">
              Help for the trader (optional) — where they find which server their account is on
            </span>
            <input className={field} value={draft.help} onChange={set("help")} />
          </label>
          <div className="flex items-center gap-2 sm:col-span-2">
            <button className={button} disabled={pending || !draft.address} onClick={save}>
              {pending ? "…" : draft.id ? "Save changes" : "Add to picker"}
            </button>
            <button
              className={button}
              disabled={pending || !draft.address}
              onClick={() => check(draft.address)}
              title="Runs a real terminal against the address on a pool box"
            >
              Check it answers
            </button>
            {draft.id || draft.address ? (
              <button className={button} disabled={pending} onClick={() => setDraft(EMPTY)}>
                Cancel
              </button>
            ) : null}
            {draft.verifiedServer ? (
              <span className="text-xs text-muted-foreground">
                Will be marked verified — {draft.verifiedServer} answered for a real trader.
              </span>
            ) : null}
          </div>
        </div>
      </Panel>

      {probes.length > 0 ? (
        <Panel
          title="Recent checks"
          note="what MetaTrader found - including addresses not in the list yet"
        >
          <Table cols={["Address", "Verdict", "What MetaTrader said", "When"]}>
            {probes.slice(0, 8).map((p) => {
              const v = verdict(p);
              return (
                <tr key={`${p.address}-${p.requested_at}`}>
                  <td className="px-4 py-2 font-mono text-xs">{p.address}</td>
                  <td className={`px-4 py-2 ${v.tone}`}>{v.text}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{p.evidence ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{ago(p.requested_at)}</td>
                </tr>
              );
            })}
          </Table>
        </Panel>
      ) : null}

      <Panel title="In the picker" note={`${rows.filter((r) => r.enabled).length} of ${rows.length} shown to traders`}>
        <Table cols={["Broker", "Server", "Address", "Kind", "Last check", "Signed in", ""]} empty="No brokers yet.">
          {rows.map((r) => (
            <tr key={r.id} className={r.enabled ? "" : "opacity-50"}>
              <td className="px-4 py-2">{r.broker}</td>
              <td className="px-4 py-2">{r.label}</td>
              <td className="px-4 py-2 font-mono text-xs">{r.address}</td>
              <td className="px-4 py-2">{r.kind}</td>
              <td className="px-4 py-2">
                {(() => {
                  const v = verdict(probes.find((p) => p.address === r.address));
                  return (
                    <span className={v.tone} title={v.title}>
                      {v.text}
                    </span>
                  );
                })()}
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {r.verified_server ? `${r.verified_server} · ${ago(r.verified_at)}` : "—"}
              </td>
              <td className="space-x-2 px-4 py-2 text-right">
                <button className={button} disabled={pending} onClick={() => check(r.address)}>
                  Check
                </button>
                <button
                  className={button}
                  disabled={pending}
                  onClick={() =>
                    setDraft({
                      id: r.id,
                      broker: r.broker,
                      label: r.label,
                      address: r.address,
                      kind: r.kind,
                      help: r.help ?? "",
                      note: r.note ?? "",
                    })
                  }
                >
                  Edit
                </button>
                <button className={button} disabled={pending} onClick={() => toggle(r.id, !r.enabled)}>
                  {r.enabled ? "Hide" : "Show"}
                </button>
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );
}

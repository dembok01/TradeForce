"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  adminSaveBrokerAction,
  adminSetBrokerEnabledAction,
  adminProbeBrokerAction,
} from "@/lib/actions/admin";
import { Panel, Table } from "@/components/admin/ui";
import type { BrokerRow, DiscoveredServer, Probe } from "@/lib/data/brokers";

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
}: {
  rows: BrokerRow[];
  discovered: DiscoveredServer[];
  probes: Probe[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(EMPTY);

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
      toast.success(draft.id ? "Server updated." : "Server added to the picker.");
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

  function toggle(id: number, enabled: boolean) {
    startTransition(async () => {
      const r = await adminSetBrokerEnabledAction(id, enabled);
      if (r.error) toast.error(r.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
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

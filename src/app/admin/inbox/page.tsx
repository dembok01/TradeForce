import { getInbox, type InboxItem } from "@/lib/data/admin";
import { fmtAge } from "@/lib/ops-health";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { Tile, Panel, Table } from "@/components/admin/ui";
import { HandledButton } from "@/components/admin/inbox-actions";

export const dynamic = "force-dynamic";

function Row({ m }: { m: InboxItem }) {
  const reply =
    m.kind === "broker"
      ? `mailto:${m.email}?subject=${encodeURIComponent(`Your broker ${m.broker ?? ""} on TradeForce`)}`
      : `mailto:${m.email}?subject=${encodeURIComponent("Re: your message to TradeForce")}`;
  return (
    <tr className={m.handledAt ? "opacity-60" : undefined}>
      <td className="whitespace-nowrap px-4 py-2 align-top">{fmtAge(m.createdAt)}</td>
      <td className="px-4 py-2 align-top">
        <span
          className={`rounded px-1.5 py-0.5 text-xs ${
            m.kind === "broker" ? "bg-amber-500/15 text-amber-600" : "bg-sky-500/15 text-sky-600"
          }`}
        >
          {m.kind === "broker" ? "Broker request" : "Message"}
        </span>
      </td>
      <td className="px-4 py-2 align-top">
        {m.kind === "message" ? <div className="font-medium">{m.name}</div> : null}
        <a href={reply} className="text-primary hover:underline">
          {m.email}
        </a>
      </td>
      <td className="max-w-xl px-4 py-2 align-top">
        {m.kind === "broker" ? (
          <>
            <div className="font-medium">{m.broker ?? "—"}</div>
            <div className="text-xs text-muted-foreground">
              Server name: {m.serverName ?? "not given"} · add it to src/lib/mt5-brokers.ts after
              verify-brokers.sh confirms the address
            </div>
          </>
        ) : (
          <p className="whitespace-pre-wrap">{m.message}</p>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-2 align-top">
        <HandledButton id={m.id} handled={Boolean(m.handledAt)} />
        {m.handledAt ? (
          <div className="mt-1 text-xs text-muted-foreground">handled {fmtAge(m.handledAt)}</div>
        ) : null}
      </td>
    </tr>
  );
}

export default async function AdminInboxPage() {
  const items = await getInbox();
  const open = items.filter((m) => !m.handledAt);
  const done = items.filter((m) => m.handledAt);
  const cols = ["Received", "Type", "From", "What they said", ""];

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={60_000} />
      <div>
        <h1 className="text-2xl font-semibold">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Contact-form messages and &ldquo;my broker isn&apos;t listed&rdquo; requests. Reply by
          email (click the address), then mark it handled so nobody answers it twice.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Waiting for a reply" value={String(open.length)} tone={open.length ? "warn" : "ok"} />
        <Tile label="Broker requests waiting" value={String(open.filter((m) => m.kind === "broker").length)} />
        <Tile label="Handled" value={String(done.length)} />
      </div>

      <Panel title="Waiting" note="oldest questions are the most urgent">
        <Table cols={cols} empty="Nothing waiting.">
          {[...open].reverse().map((m) => (
            <Row key={m.id} m={m} />
          ))}
        </Table>
      </Panel>

      {done.length > 0 ? (
        <Panel title="Handled" note="newest first">
          <Table cols={cols}>
            {done.map((m) => (
              <Row key={m.id} m={m} />
            ))}
          </Table>
        </Panel>
      ) : null}
    </div>
  );
}

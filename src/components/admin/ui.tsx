import Link from "next/link";
import type { Health } from "@/lib/ops-health";

const DOT: Record<Health, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  down: "bg-red-500",
  idle: "bg-muted-foreground/40",
};

export function Dot({ h }: { h: Health }) {
  return <span className={`inline-block size-2 rounded-full ${DOT[h]}`} aria-hidden />;
}

export function Tile({ label, value, tone, hint, href }: {
  label: string; value: string; tone?: Health; hint?: string; href?: string;
}) {
  const body = (
    <>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-2 text-2xl font-semibold tabular-nums">
        {tone ? <Dot h={tone} /> : null}
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </>
  );
  return href
    ? <Link href={href} className="rounded-lg border p-4 transition-colors hover:bg-muted/50">{body}</Link>
    : <div className="rounded-lg border p-4">{body}</div>;
}

export function Panel({ title, note, children }: {
  title: string; note?: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border">
      <h2 className="border-b px-4 py-3 text-sm font-medium">
        {title}
        {note ? <span className="ml-2 font-normal text-muted-foreground">— {note}</span> : null}
      </h2>
      {children}
    </section>
  );
}

export function Table({ cols, children, empty }: {
  cols: string[]; children: React.ReactNode; empty?: string;
}) {
  const rows = Array.isArray(children) ? children.flat() : [children];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>{cols.map((c) => (
            <th key={c} className="whitespace-nowrap px-4 py-2 font-medium">{c}</th>
          ))}</tr>
        </thead>
        <tbody className="divide-y">
          {rows.filter(Boolean).length === 0
            ? <tr><td colSpan={cols.length} className="px-4 py-6 text-muted-foreground">{empty ?? "Nothing here."}</td></tr>
            : children}
        </tbody>
      </table>
    </div>
  );
}

/** Label/value pairs for detail pages. */
export function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="divide-y">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-4 px-4 py-2 text-sm">
          <dt className="w-40 shrink-0 text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A shell command the operator is expected to paste into their own terminal. */
export function Cmd({ children }: { children: string }) {
  return (
    <code className="block overflow-x-auto rounded bg-muted px-3 py-2 font-mono text-xs">
      {children}
    </code>
  );
}

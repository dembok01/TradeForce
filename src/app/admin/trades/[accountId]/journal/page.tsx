import Link from "next/link";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { formatDistanceStrict } from "date-fns";
import { getAccountJournal } from "@/lib/data/admin-trades";
import { formatCurrency, formatSignedCurrency } from "@/lib/format";
import { PrintButton } from "@/components/admin/print-trigger";

export const dynamic = "force-dynamic";

/**
 * One account's complete journal, laid out as the page it will become.
 *
 * It renders as a white sheet in both themes on purpose. The product is
 * dark-first, and printing a dark page either wastes a cartridge or drops the
 * backgrounds and takes the text with them - so what is on screen here is what
 * lands in the PDF.
 *
 * The PDF itself comes from the browser: "Save as PDF" in its print dialog.
 * That keeps real fonts, selectable text and working text search, needs no
 * dependency, and cannot run out of memory in a serverless function. The cost
 * is that it is two clicks rather than a byte stream from a URL.
 */

const SHEET_CSS = `
@page { size: A4 landscape; margin: 12mm; }
@media print {
  html, body { background: #fff !important; }
}
`;

function fmt(iso: string | null, tz: string, pattern = "dd MMM yyyy HH:mm"): string {
  return iso ? formatInTimeZone(new Date(iso), tz, pattern) : "—";
}

function held(entry: string, exit: string | null): string {
  if (!exit) return "open";
  const a = new Date(entry);
  const b = new Date(exit);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return "—";
  return formatDistanceStrict(b, a);
}

export default async function AccountJournalPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const journal = await getAccountJournal(accountId);
  if (!journal) notFound();

  const { owner, summary, trades, startingBalance, currentEquity, truncated, generatedAt } = journal;
  const tz = owner.timezone;

  const facts: [string, string][] = [
    ["Trader", owner.fullName ? `${owner.fullName} · ${owner.email}` : owner.email],
    ["Account", owner.broker ? `${owner.accountName} · ${owner.broker}` : owner.accountName],
    [
      "Period",
      summary.firstEntry
        ? `${fmt(summary.firstEntry, tz, "dd MMM yyyy")} — ${fmt(summary.lastEntry, tz, "dd MMM yyyy")}`
        : "no trades on record",
    ],
    ["Times shown in", `${tz} — the trader's own clock`],
    ["Generated", `${fmt(generatedAt, tz, "dd MMM yyyy HH:mm")} (${tz})`],
  ];

  const stats: [string, string][] = [
    ["Trades", String(summary.total)],
    ["Closed / open", `${summary.closed} / ${summary.open}`],
    ["Win rate", summary.closed === 0 ? "—" : `${summary.winRatePercent.toFixed(1)}%`],
    ["Won / lost / flat", `${summary.wins} / ${summary.losses} / ${summary.breakeven}`],
    ["Gross profit", formatCurrency(summary.grossProfit)],
    ["Gross loss", formatCurrency(summary.grossLoss)],
    ["Net P/L", formatSignedCurrency(summary.netPnl)],
    ["Best / worst", summary.bestTrade === null
      ? "—"
      : `${formatSignedCurrency(summary.bestTrade)} / ${formatSignedCurrency(summary.worstTrade ?? 0)}`],
    ["Starting balance", startingBalance === null ? "—" : formatCurrency(startingBalance)],
    ["Equity now", currentEquity === null ? "—" : formatCurrency(currentEquity)],
    ["Instruments", summary.symbols.length === 0 ? "—" : summary.symbols.join(", ")],
  ];

  return (
    <>
      <style>{SHEET_CSS}</style>

      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        <Link
          href={`/admin/trades?account=${owner.accountId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← back to trades
        </Link>
        <span className="ml-auto text-xs text-muted-foreground">
          Choose <strong>Save as PDF</strong> as the destination. Landscape A4 is preset.
        </span>
        <PrintButton />
      </div>

      <article className="mx-auto max-w-[1100px] bg-white p-10 text-neutral-900 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="mb-6 border-b-2 border-neutral-900 pb-3">
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="text-xl font-semibold tracking-tight">Trading journal</h1>
            <span className="text-sm font-medium">TradeForce</span>
          </div>
          <p className="mt-1 text-xs text-neutral-600">
            A complete record of every trade reported for this account, in the order they were
            opened.
          </p>
        </header>

        {truncated ? (
          <p className="mb-5 border border-neutral-900 p-3 text-sm font-medium">
            This account has more trades than one document holds. The record below stops at{" "}
            {trades.length.toLocaleString()} and is <strong>not complete</strong> — do not present
            it as a full history.
          </p>
        ) : null}

        <dl className="mb-6 grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          {facts.map(([k, v]) => (
            <div key={k} className="flex gap-3 border-b border-neutral-200 py-1">
              <dt className="w-32 shrink-0 text-neutral-500">{k}</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>

        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">Summary</h2>
        <dl className="mb-6 grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-3">
          {stats.map(([k, v]) => (
            <div key={k} className="flex gap-3 border-b border-neutral-200 py-1">
              <dt className="w-32 shrink-0 text-neutral-500">{k}</dt>
              <dd className="min-w-0 break-words tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>

        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">
          Trades{trades.length > 0 ? ` (${trades.length.toLocaleString()})` : ""}
        </h2>
        {trades.length === 0 ? (
          <p className="text-sm text-neutral-600">
            No trade has ever been reported for this account.
          </p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="border-b border-neutral-900 text-left">
              <tr>
                {["#", "Opened", "Closed", "Held", "Symbol", "Side", "Qty", "In", "Out", "P/L", "Src", "Notes"].map(
                  (c) => (
                    <th key={c} className="py-1 pr-3 font-semibold">
                      {c}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {trades.map((t, i) => (
                <tr key={t.id} className="break-inside-avoid border-b border-neutral-200 align-top">
                  <td className="py-1 pr-3 tabular-nums text-neutral-500">{i + 1}</td>
                  <td className="whitespace-nowrap py-1 pr-3 tabular-nums">{fmt(t.entry_time, tz)}</td>
                  <td className="whitespace-nowrap py-1 pr-3 tabular-nums">{fmt(t.exit_time, tz)}</td>
                  <td className="whitespace-nowrap py-1 pr-3">{held(t.entry_time, t.exit_time)}</td>
                  <td className="py-1 pr-3 font-medium">{t.symbol}</td>
                  <td className="py-1 pr-3">{t.direction}</td>
                  <td className="py-1 pr-3 tabular-nums">{t.quantity ?? "—"}</td>
                  <td className="py-1 pr-3 tabular-nums">{t.entry_price}</td>
                  <td className="py-1 pr-3 tabular-nums">{t.exit_price ?? "—"}</td>
                  <td className="whitespace-nowrap py-1 pr-3 font-medium tabular-nums">
                    {t.pnl === null ? "open" : formatSignedCurrency(t.pnl)}
                  </td>
                  <td className="py-1 pr-3 text-neutral-500">{t.source}</td>
                  <td className="py-1 text-neutral-700">{t.notes || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <footer className="mt-6 border-t border-neutral-300 pt-2 text-[10px] text-neutral-500">
          Rows marked EA were reported by the TradeForce Expert Advisor from the broker&apos;s own
          deal history. Rows marked MANUAL were entered by hand and are not broker-verified.
        </footer>
      </article>
    </>
  );
}

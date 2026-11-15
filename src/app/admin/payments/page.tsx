import { getPaymentQueue, signedProofUrl } from "@/lib/data/billing";
import { formatInr } from "@/lib/billing/plans";
import { fmtAge } from "@/lib/ops-health";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { Tile, Panel, Table } from "@/components/admin/ui";
import { PaymentDecision } from "@/components/admin/payment-actions";
import { payee } from "@/lib/billing/payee";

export const dynamic = "force-dynamic";

/**
 * The verification step the missing payment gateway would have done.
 *
 * A trader pays by UPI and tells us the transaction ID; nobody can tell us it
 * landed, because NPCI exposes no API to third-party sites. So this page puts
 * everything needed to check one claim in one row — reference, amount,
 * transaction ID, screenshot — and grants the plan on a click.
 */

const COLS = ["Claimed", "Trader", "Reference", "Period", "Amount", "UPI transaction", "Proof", ""];

function fmtWhen(iso: string | null) {
  return iso ? fmtAge(iso) : "—";
}

export default async function AdminPaymentsPage() {
  const all = await getPaymentQueue();
  const destination = payee();

  const waiting = all.filter((p) => p.status === "claimed");
  const unpaid = all.filter((p) => p.status === "awaiting_payment");
  const decided = all.filter((p) => p.status === "approved" || p.status === "rejected");

  // Signed links are minted per render and die in ten minutes, so they are
  // generated here rather than stored anywhere.
  const proofs = new Map(
    await Promise.all(
      [...waiting, ...unpaid].map(
        async (p) => [p.id, await signedProofUrl(p.proof_path)] as const
      )
    )
  );

  const approvedTotal = decided
    .filter((p) => p.status === "approved")
    .reduce((sum, p) => sum + Number(p.amount_inr), 0);

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={60_000} />
      <div>
        <h1 className="text-2xl font-semibold">Payments</h1>
        <p className="text-sm text-muted-foreground">
          UPI payments traders say they&apos;ve made. Search the transaction ID in Google Pay, check
          the amount and the reference, then approve — approving extends their plan immediately.
          {destination ? (
            <>
              {" "}
              Paid into <span className="font-mono">{destination.vpa}</span>.
            </>
          ) : (
            <>
              {" "}
              <span className="text-amber-600">
                No UPI handle is configured, so traders currently cannot pay at all.
              </span>
            </>
          )}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Tile
          label="Waiting to check"
          value={String(waiting.length)}
          tone={waiting.length ? "warn" : "ok"}
          hint="traders who have paid and are waiting"
        />
        <Tile label="Started, not paid" value={String(unpaid.length)} hint="QR shown, no claim yet" />
        <Tile label="Decided" value={String(decided.length)} />
        <Tile label="Approved value" value={formatInr(approvedTotal)} hint="all time" />
      </div>

      <Panel title="Waiting to check" note="oldest first — a trader who has paid is waiting on you">
        <Table cols={COLS} empty="No payments waiting.">
          {[...waiting].reverse().map((p) => (
            <tr key={p.id}>
              <td className="whitespace-nowrap px-4 py-2 align-top">{fmtWhen(p.claimed_at)}</td>
              <td className="px-4 py-2 align-top">
                <div className="font-medium">{p.fullName ?? "—"}</div>
                <a
                  href={`mailto:${p.email ?? ""}?subject=${encodeURIComponent(`Your TradeForce payment ${p.reference}`)}`}
                  className="text-primary hover:underline"
                >
                  {p.email ?? "unknown"}
                </a>
                {p.phone ? (
                  <div>
                    <a href={`tel:${p.phone}`} className="text-xs text-muted-foreground hover:underline">
                      {p.phone}
                    </a>
                  </div>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-4 py-2 align-top font-mono text-xs">
                {p.reference}
              </td>
              <td className="whitespace-nowrap px-4 py-2 align-top">
                {p.months} month{p.months === 1 ? "" : "s"}
              </td>
              <td className="whitespace-nowrap px-4 py-2 align-top tabular-nums">
                {formatInr(Number(p.amount_inr))}
              </td>
              <td className="whitespace-nowrap px-4 py-2 align-top font-mono text-xs">
                {p.utr ?? "—"}
              </td>
              <td className="px-4 py-2 align-top">
                {proofs.get(p.id) ? (
                  <a
                    href={proofs.get(p.id)!}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    screenshot
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">none</span>
                )}
              </td>
              <td className="px-4 py-2 align-top">
                <PaymentDecision
                  id={p.id}
                  reference={p.reference}
                  months={p.months}
                  amountInr={Number(p.amount_inr)}
                />
              </td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel
        title="Started but not paid"
        note="a QR was shown and nothing came back - usually abandoned, occasionally paid without telling us"
      >
        <Table cols={COLS} empty="Nothing open.">
          {[...unpaid].reverse().map((p) => (
            <tr key={p.id} className="opacity-70">
              <td className="whitespace-nowrap px-4 py-2 align-top">{fmtWhen(p.created_at)}</td>
              <td className="px-4 py-2 align-top">
                <div className="font-medium">{p.fullName ?? "—"}</div>
                <span className="text-muted-foreground">{p.email ?? "unknown"}</span>
              </td>
              <td className="whitespace-nowrap px-4 py-2 align-top font-mono text-xs">
                {p.reference}
              </td>
              <td className="whitespace-nowrap px-4 py-2 align-top">
                {p.months} month{p.months === 1 ? "" : "s"}
              </td>
              <td className="whitespace-nowrap px-4 py-2 align-top tabular-nums">
                {formatInr(Number(p.amount_inr))}
              </td>
              <td className="px-4 py-2 align-top text-xs text-muted-foreground">not submitted</td>
              <td className="px-4 py-2 align-top text-xs text-muted-foreground">—</td>
              <td className="px-4 py-2 align-top">
                <PaymentDecision
                  id={p.id}
                  reference={p.reference}
                  months={p.months}
                  amountInr={Number(p.amount_inr)}
                />
              </td>
            </tr>
          ))}
        </Table>
      </Panel>

      {decided.length > 0 ? (
        <Panel title="Decided" note="newest first">
          <Table cols={["When", "Trader", "Reference", "Amount", "Outcome", "By"]}>
            {decided.map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap px-4 py-2 align-top">{fmtWhen(p.decided_at)}</td>
                <td className="px-4 py-2 align-top">{p.email ?? "unknown"}</td>
                <td className="whitespace-nowrap px-4 py-2 align-top font-mono text-xs">
                  {p.reference}
                </td>
                <td className="whitespace-nowrap px-4 py-2 align-top tabular-nums">
                  {formatInr(Number(p.amount_inr))}
                </td>
                <td className="px-4 py-2 align-top">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      p.status === "approved"
                        ? "bg-emerald-500/15 text-emerald-600"
                        : "bg-red-500/15 text-red-600"
                    }`}
                  >
                    {p.status === "approved" ? "Approved" : "Rejected"}
                  </span>
                  {p.note ? (
                    <div className="mt-1 text-xs text-muted-foreground">{p.note}</div>
                  ) : null}
                </td>
                <td className="px-4 py-2 align-top text-xs text-muted-foreground">
                  {p.decided_by ?? "—"}
                </td>
              </tr>
            ))}
          </Table>
        </Panel>
      ) : null}
    </div>
  );
}

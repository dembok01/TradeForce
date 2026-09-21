import Link from "next/link";
import { getSignups } from "@/lib/data/admin";
import { eaHealth, desktopHealth, fmtAge, ageMs, type Health } from "@/lib/ops-health";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { Dot, Tile, Panel, Table } from "@/components/admin/ui";
import { UserActions } from "@/components/admin/user-actions";
import { supportIssues } from "@/lib/support-issues";
import { tradeBlockHelp } from "@/lib/ea-trade-block";

export const dynamic = "force-dynamic";

/** Where each signup stopped, in the order a trader goes through it. */
function stage(s: Awaited<ReturnType<typeof getSignups>>[number]) {
  if (s.connection === "none") return s.rulesConfigured ? "rules set" : s.onboardedAt ? "onboarded" : "signed up";
  return "connected";
}

export default async function AdminUsersPage() {
  const signups = await getSignups();

  const onboarded = signups.filter((s) => s.onboardedAt);
  const withRules = signups.filter((s) => s.rulesConfigured);
  const connected = signups.filter((s) => s.connection !== "none");
  const protectedNow = signups.filter(
    (s) => s.connection === "cloud" && eaHealth(s.lastSeenAt, "running") === "ok"
  );
  const stalled = signups.filter((s) => s.connection === "none");
  const needHelp = signups
    .map((s) => ({ s, issues: supportIssues(s) }))
    .filter((x) => x.issues.length > 0);

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={30_000} />

      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-muted-foreground">
          Everyone who has signed up, how far they got, and what is running for them right now.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label="Signed up" value={String(signups.length)} />
        <Tile label="Finished onboarding" value={`${onboarded.length} / ${signups.length}`} />
        <Tile label="Rules set" value={`${withRules.length} / ${signups.length}`} />
        <Tile label="Connected" value={`${connected.length} / ${signups.length}`}
              tone={connected.length === signups.length ? "ok" : "warn"} />
        <Tile label="Protected right now" value={String(protectedNow.length)}
              tone={protectedNow.length > 0 ? "ok" : "warn"} hint="cloud terminal reporting" />
      </div>

      {needHelp.length > 0 ? (
        <Panel title="Needs help now" note="connected, but something is stopping enforcement - worst first">
          <Table cols={["User", "Problem", "What to tell them"]}>
            {needHelp.flatMap(({ s, issues }) =>
              issues.map((i, n) => (
                <tr key={`${s.userId}-${n}`}>
                  <td className="px-4 py-2 align-top">
                    {n === 0 ? (
                      <>
                        <div className="font-medium">{s.email}</div>
                        {s.mt5Login ? (
                          <div className="text-xs text-muted-foreground">
                            {s.mt5Login} · {s.mt5Server}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 align-top">
                    <Dot h={i.level} /> {i.problem}
                  </td>
                  <td className="px-4 py-2 align-top text-muted-foreground">{i.tellThem}</td>
                </tr>
              ))
            )}
          </Table>
        </Panel>
      ) : null}

      {stalled.length > 0 ? (
        <Panel title="Signed up but never connected" note="the people to chase during a trial">
          <Table cols={["User", "Signed up", "Got as far as", "Rules"]}>
            {stalled.map((s) => (
              <tr key={s.userId}>
                <td className="px-4 py-2 font-medium">{s.email}</td>
                <td className="whitespace-nowrap px-4 py-2">{fmtAge(s.createdAt)}</td>
                <td className="px-4 py-2">{stage(s)}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {s.rulesConfigured ? (s.rulesActive ? "set, active" : "set, paused") : "none"}
                </td>
              </tr>
            ))}
          </Table>
        </Panel>
      ) : null}

      <Panel title="Everyone" note="newest first">
        <Table
          cols={["User", "Signed up", "Onboarded", "Rules", "Connection", "MT5", "Last seen", "Equity", "Actions"]}
          empty="Nobody has signed up yet."
        >
          {signups.map((s) => {
            const health: Health =
              s.connection === "cloud"
                ? eaHealth(s.lastSeenAt, s.cloudDesired ?? "running")
                : s.connection === "desktop"
                  ? desktopHealth(s.lastSeenAt)
                  : "idle";
            const late = s.connection === "none" && (ageMs(s.createdAt) ?? 0) > 24 * 3600_000;
            return (
              <tr key={s.userId} className={late ? "bg-amber-500/5" : undefined}>
                <td className="px-4 py-2">
                  <div className="font-medium">{s.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.fullName ?? "—"}
                    {s.propFirm ? ` · ${s.propFirm}` : ""}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-2">{fmtAge(s.createdAt)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                  {s.onboardedAt ? fmtAge(s.onboardedAt) : "no"}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {s.rulesConfigured ? (s.rulesActive ? "active" : "paused") : "none"}
                </td>
                <td className="whitespace-nowrap px-4 py-2">
                  <Dot h={health} />{" "}
                  {s.connection === "cloud"
                    ? `cloud · ${s.cloudStatus ?? "—"}`
                    : s.connection === "desktop"
                      ? "own PC"
                      : "not connected"}
                  {s.cloudDetail ? (
                    <div
                      className={`text-xs ${s.cloudStatus === "login_failed" || s.cloudStatus === "error" ? "text-red-500" : "text-muted-foreground"}`}
                    >
                      {s.cloudDetail}
                    </div>
                  ) : null}
                  {s.eaTradeBlock ? (
                    <div className="text-xs text-red-500">
                      Can&apos;t trade: {tradeBlockHelp(s.eaTradeBlock)?.title}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">
                  {s.mt5Login ? (
                    <>
                      {s.mt5Login}
                      <div className="text-xs">{s.mt5Server}</div>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2">{fmtAge(s.lastSeenAt)}</td>
                <td className="px-4 py-2 tabular-nums">{s.equity?.toFixed(2) ?? "—"}</td>
                <td className="px-4 py-2">
                  <UserActions
                    userId={s.userId}
                    email={s.email}
                    accountId={s.accountId}
                    hasCloud={s.connection === "cloud"}
                    hasKeys={s.activeKeys > 0}
                  />
                  {s.accountId && s.connection !== "none" ? (
                    <Link
                      href={`/admin/instances/${s.accountId}`}
                      className="mt-1 block text-xs text-muted-foreground hover:underline"
                    >
                      Full detail →
                    </Link>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </Table>
      </Panel>
    </div>
  );
}

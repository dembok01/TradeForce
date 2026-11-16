import { redirect } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { Ban, ShieldCheck, TriangleAlert } from "lucide-react";
import { getSetupStatus } from "@/lib/data/setup";
import { getApiKeys, getEaConnection } from "@/lib/data/api-keys";
import { disconnectOtherConnectionAction } from "@/lib/actions/profile";
import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/data/profile";
import { getCloudEa } from "@/lib/data/cloud-ea";
import { getEntitlement } from "@/lib/data/billing";
import { getPickerServers } from "@/lib/data/brokers";
import { advisoryPolicyForFirm } from "@/lib/mt5-brokers";
import { eaSeenWithin, EA_CONNECTED_WINDOW_MS } from "@/lib/ea-connection";
import { siteUrl } from "@/lib/env";
import { PageHeader } from "@/components/dashboard/page-header";
import { SetupChecklistPanel } from "@/components/dashboard/setup-checklist";
import { AccountModeSwitch } from "@/components/dashboard/account-mode-switch";
import { LockedPage } from "@/components/billing/locked-page";
import { FUNDED_FIRMS } from "@/lib/funded-firms";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/motion/reveal";

/**
 * The funded-account route, as a page rather than a notice.
 *
 * A trader arrives here having chosen it, so it owes them the whole argument
 * and the whole setup - unlike the short refusal inside the Connect card,
 * which only has to explain why the password fields vanished.
 *
 * The firm's policy is looked up by NAME here (what onboarding collects),
 * which is advisory. Nothing on this page refuses anyone: the hosted pool's
 * actual guard is eaPolicyFor() on a catalogued address, enforced server-side
 * in enableCloudEaAction.
 */
export default async function FundedEaSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ switch?: string }>;
}) {
  const entitlement = await getEntitlement();
  if (!entitlement.active) {
    return (
      <LockedPage eyebrow="Funded account" title="Funded account setup" expired={Boolean(entitlement.expiresAt)}>
        Run the EA on your own MT5 for your funded or challenge account.
      </LockedPage>
    );
  }

  const profile = await getProfile();
  if (profile?.connection_route !== "funded") redirect("/dashboard/ea-setup");

  const [{ checklist }, { lastSeenAt }, catalogue, cloudEa, keys, params] = await Promise.all([
    getSetupStatus(),
    getEaConnection(),
    getPickerServers(),
    getCloudEa(),
    getApiKeys(),
    searchParams,
  ]);
  const liveKeys = keys.filter((k) => !k.revoked_at);

  const connected = eaSeenWithin(lastSeenAt, EA_CONNECTED_WINDOW_MS);
  const firm = profile?.prop_firm?.trim() || "";
  const who = firm || "Your firm";
  const policy = advisoryPolicyForFirm(catalogue, firm);
  // We have read this firm's contract and it bans EAs outright, so there is no
  // setup to walk them through - showing the steps anyway would be an invitation.
  const banned = policy === "prohibited";

  return (
    <div>
      <PageHeader
        eyebrow="Funded account"
        title="Run TradeForce on your own MetaTrader"
        titleEmphasis="your own"
        description="Funded and challenge accounts don't go through our hosted terminal. Here is why, and how to set yours up."
        action={
          connected ? (
            <Badge variant="success">Connected</Badge>
          ) : lastSeenAt ? (
            <Badge variant="warning">
              Last seen {formatDistanceToNowStrict(new Date(lastSeenAt), { addSuffix: true })}
            </Badge>
          ) : (
            <Badge variant="secondary">Not connected yet</Badge>
          )
        }
      />

      <AccountModeSwitch
        current="funded"
        connected={cloudEa.enabled || liveKeys.length > 0}
        confirming={params.switch}
      />

      {/* A hosted terminal left running from before modes were exclusive. */}
      {cloudEa.enabled && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-medium">A hosted terminal is also connected</p>
          <p className="mt-1 text-sm text-muted-foreground">
            One account takes one connection, and funded account mode uses the downloadable EA.
            Stop the hosted terminal before you connect the EA.
          </p>
          <form action={disconnectOtherConnectionAction} className="mt-3">
            <Button type="submit" variant="destructive" size="sm">
              Stop the hosted terminal
            </Button>
          </form>
        </div>
      )}

      <Reveal>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" aria-hidden />
              Why not the hosted terminal
            </CardTitle>
            <CardDescription>
              It is not about the Expert Advisor. It is about who holds your password.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Every firm we have read requires that <strong>you</strong> place your own trades. A
              hosted terminal means TradeForce signs in to your account and holds your trading
              password to do it — and that is the clause that costs traders their accounts and
              their payouts, long before anyone asks about an EA.
            </p>
            <p>
              No amount of infrastructure fixes that. We could give a hosted terminal its own IP
              address for a few dollars a month. We cannot make your password not ours.
            </p>
            <p>
              Running the same EA on your own MetaTrader removes that clause outright — and takes
              three other flags with it: a datacentre address shared with other traders, a machine
              fingerprint identical on every hosted terminal, and a session that never sleeps. Your
              rules, your charter, your dashboard and your violation record all work exactly as they
              do for everyone else.
            </p>
            <p className="border-t pt-3">
              <strong className="text-foreground">The honest trade.</strong> The EA protects you only
              while that computer is on and MetaTrader is running. On a funded account your firm&apos;s
              own drawdown limit is the hard stop regardless, so what TradeForce adds here is
              discipline rather than a backstop. If your terminal stops reporting, we will tell you —
              you are never unprotected without knowing.
            </p>
          </CardContent>
        </Card>
      </Reveal>

      <Reveal delay={0.1}>
        {banned ? (
          <Card className="mt-4 border-destructive/40 bg-destructive/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ban className="size-4 shrink-0 text-destructive" aria-hidden />
                {who} does not allow Expert Advisors
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Their terms prohibit EAs, bots and scripts on every account and every platform. There
                is no setup we can offer that keeps you inside your agreement — not our hosted
                terminal, and not the downloadable EA either. Attaching it would put your account and
                any payout already earned at risk, so we are not going to walk you through it.
              </p>
              <p>
                You can still use TradeForce on an ordinary broker account. And if you believe their
                policy has changed, ask them in writing and send us their reply — we will re-read it
                and update this page.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="mt-4 border-amber-500/40 bg-amber-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TriangleAlert className="size-4 shrink-0 text-amber-600" aria-hidden />
                {policy === "approval_required"
                  ? `Get ${who}'s written approval first`
                  : `Ask ${who} in writing first`}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {policy === "approval_required" ? (
                <p>
                  {who} permits Expert Advisors and reviews them in advance. Ask them before you
                  attach it, and <strong className="text-foreground">keep their reply</strong> — a
                  written approval is what protects your payout if you are ever asked about it.
                </p>
              ) : (
                <p>
                  We have not read {firm ? `${who}'s` : "your firm's"} EA policy ourselves, so we
                  will not tell you it is fine. Ask them whether an Expert Advisor is allowed on your
                  account, get the answer in writing, and keep it.
                </p>
              )}
              <p>
                Send us what they say and we will record it against the firm, so the next trader does
                not have to ask the same question.
              </p>
            </CardContent>
          </Card>
        )}
      </Reveal>

      {/* Paid view only: the page above returns early without a plan. Where we
          have read a firm's contract, its EA policy sits beside the name. */}
      <Reveal delay={0.15}>
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Allowed list</CardTitle>
            <CardDescription>
              Funded firms whose MT5 accounts the EA attaches to. Each sets its own EA rules, so
              check yours in writing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {FUNDED_FIRMS.map((name) => {
                const firmPolicy = advisoryPolicyForFirm(catalogue, name);
                return (
                  <li key={name} className="flex items-center gap-2">
                    <span className="size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
                    <span>{name}</span>
                    {firmPolicy === "approval_required" && (
                      <Badge variant="warning" className="ml-auto">
                        Approval first
                      </Badge>
                    )}
                    {firmPolicy === "prohibited" && (
                      <Badge variant="destructive" className="ml-auto">
                        No EAs
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </Reveal>

      {!banned && (
        <Reveal delay={0.2}>
          <div className="mt-6">
            <h2 className="font-display text-lg font-semibold tracking-tight">Set it up</h2>
            <p className="mb-3 mt-1 text-sm text-muted-foreground">
              Five steps, about ten minutes. Three of them tick themselves the moment your terminal
              reports in — there is nothing to mark as done by hand.
            </p>
            <SetupChecklistPanel
              initialChecklist={checklist}
              initialLastSeenAt={lastSeenAt}
              siteUrl={siteUrl()}
            />
          </div>
        </Reveal>
      )}

    </div>
  );
}

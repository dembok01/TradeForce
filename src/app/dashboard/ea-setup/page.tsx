import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { getApiKeys, getEaConnection } from "@/lib/data/api-keys";
import { disconnectOtherConnectionAction } from "@/lib/actions/profile";
import { Button } from "@/components/ui/button";
import { getCloudEa } from "@/lib/data/cloud-ea";
import { getAccountContext } from "@/lib/data/context";
import { getProfile } from "@/lib/data/profile";
import { getEntitlement } from "@/lib/data/billing";
import { eaSeenWithin, EA_CONNECTED_WINDOW_MS } from "@/lib/ea-connection";
import { PageHeader } from "@/components/dashboard/page-header";
import { CloudEaCard } from "@/components/dashboard/cloud-ea-card";
import { AccountModeSwitch } from "@/components/dashboard/account-mode-switch";
import { LockedPage } from "@/components/billing/locked-page";
import { getPickerServers } from "@/lib/data/brokers";
import { TradeBlockAlert } from "@/components/dashboard/trade-block-alert";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/motion/reveal";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";

/**
 * Normal account mode: the hosted terminal, signed in with the trader's MT5
 * login and password, and nothing else. Funded account mode lives at
 * /dashboard/ea-setup/funded and shows only the downloadable EA; the switch at
 * the top moves between them.
 */
export default async function EaSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ switch?: string }>;
}) {
  // Locked before anything else is read: connecting asks for a broker password
  // or hands over the EA, and neither belongs in front of an account without a
  // plan. The EA file itself refuses to start without a paid account's key.
  const entitlement = await getEntitlement();
  if (!entitlement.active) {
    return (
      <LockedPage eyebrow="Connect" title="EA setup" expired={Boolean(entitlement.expiresAt)}>
        Connect your MT5 account. We run the terminal for you, or you run the EA on your own.
      </LockedPage>
    );
  }

  const profile = await getProfile();
  if (profile?.connection_route === "funded") redirect("/dashboard/ea-setup/funded");

  const [{ lastSeenAt }, cloudEa, { account }, brokerServers, keys, params] = await Promise.all([
    getEaConnection(),
    getCloudEa(),
    getAccountContext(),
    getPickerServers(),
    getApiKeys(),
    searchParams,
  ]);
  const connected = eaSeenWithin(lastSeenAt, EA_CONNECTED_WINDOW_MS);
  const liveKeys = keys.filter((k) => !k.revoked_at);
  // A downloaded EA still holding a key from before modes were exclusive.
  const downloadedToo = liveKeys.some((k) => k.label !== "Cloud EA");

  // Provisioning takes a few minutes and the card is server-rendered: without
  // this the trader watches "Starting..." until they think to reload.
  const settling = cloudEa.enabled && cloudEa.status !== "protected";

  return (
    <div>
      <AutoRefresh intervalMs={settling ? 10_000 : 60_000} />
      <PageHeader
        eyebrow="Connect"
        title="Connect your MetaTrader account"
        titleEmphasis="account"
        description="Enter your MT5 login once and we run your terminal for you, day and night. Nothing to install."
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
        current="broker"
        connected={cloudEa.enabled || liveKeys.length > 0}
        confirming={params.switch}
      />

      {downloadedToo && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-medium">An EA on your own computer is also connected</p>
          <p className="mt-1 text-sm text-muted-foreground">
            One account takes one connection, and normal account mode uses the hosted terminal.
            Disconnect the other EA, then remove it from your MT5 chart.
          </p>
          <form action={disconnectOtherConnectionAction} className="mt-3">
            <Button type="submit" variant="destructive" size="sm">
              Disconnect the downloaded EA
            </Button>
          </form>
        </div>
      )}

      {connected && account.ea_trade_block && (
        <Reveal y={8} className="mb-4">
          <TradeBlockAlert code={account.ea_trade_block} />
        </Reveal>
      )}

      <Reveal>
        <CloudEaCard initial={cloudEa} propFirm={profile?.prop_firm} servers={brokerServers} />
      </Reveal>

      <Reveal delay={0.1}>
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>What we enforce once you&apos;re connected</CardTitle>
            <CardDescription>
              Daily loss limit · max trades per day · max open positions · risk per trade · session
              windows. A trade that breaks your charter is closed immediately and logged in the{" "}
              <Link href="/dashboard/violations" className="text-primary hover:underline">
                Violation Centre
              </Link>
              . Rule changes you save reach your terminal within seconds.
            </CardDescription>
          </CardHeader>
        </Card>
      </Reveal>
    </div>
  );
}

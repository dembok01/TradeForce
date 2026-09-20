import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { getSetupStatus } from "@/lib/data/setup";
import { getEaConnection } from "@/lib/data/api-keys";
import { getCloudEa } from "@/lib/data/cloud-ea";
import { eaSeenWithin, EA_CONNECTED_WINDOW_MS } from "@/lib/ea-connection";
import { PageHeader } from "@/components/dashboard/page-header";
import { SetupChecklistPanel } from "@/components/dashboard/setup-checklist";
import { CloudEaCard } from "@/components/dashboard/cloud-ea-card";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/motion/reveal";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://trade-force-rouge.vercel.app";

export default async function EaSetupPage() {
  const [{ checklist }, { lastSeenAt }, cloudEa] = await Promise.all([
    getSetupStatus(),
    getEaConnection(),
    getCloudEa(),
  ]);
  const connected = eaSeenWithin(lastSeenAt, EA_CONNECTED_WINDOW_MS);

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
        description="Enter your account details once and we run your terminal for you, day and night. Nothing to install, nothing to leave switched on."
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

      <Reveal>
        <CloudEaCard initial={cloudEa} />
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

      {/* The download path still works and some traders want it, but it is the
          exception: it only protects them while their own PC is awake. Folded
          away so the account form above is the obvious thing to do. */}
      <Reveal delay={0.2}>
        <details className="mt-4 rounded-xl border bg-card">
          <summary className="cursor-pointer list-none p-5 [&::-webkit-details-marker]:hidden">
            <span className="font-display text-base font-medium">
              Rather run it on your own computer?
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              Advanced · only protects you while that computer is on and MetaTrader is open.
              Most traders should use the form above instead.
            </span>
          </summary>
          <div className="border-t p-5 pt-4">
            <SetupChecklistPanel
              initialChecklist={checklist}
              initialLastSeenAt={lastSeenAt}
              siteUrl={SITE_URL}
            />
          </div>
        </details>
      </Reveal>
    </div>
  );
}

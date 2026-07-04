import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { getSetupStatus } from "@/lib/data/setup";
import { getEaConnection } from "@/lib/data/api-keys";
import { eaSeenWithin, EA_CONNECTED_WINDOW_MS } from "@/lib/ea-connection";
import { PageHeader } from "@/components/dashboard/page-header";
import { SetupChecklistPanel } from "@/components/dashboard/setup-checklist";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/motion/reveal";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://trade-force-rouge.vercel.app";

export default async function EaSetupPage() {
  const [{ checklist }, { lastSeenAt }] = await Promise.all([getSetupStatus(), getEaConnection()]);
  const connected = eaSeenWithin(lastSeenAt, EA_CONNECTED_WINDOW_MS);

  return (
    <div>
      <PageHeader
        eyebrow="EA Setup"
        title="Connect your terminal"
        titleEmphasis="terminal"
        description="Five steps — each one verifies itself. Nothing here is a checkbox you can fake."
        action={
          connected ? (
            <Badge variant="success">Connected</Badge>
          ) : lastSeenAt ? (
            <Badge variant="warning">
              Last seen {formatDistanceToNowStrict(new Date(lastSeenAt), { addSuffix: true })}
            </Badge>
          ) : (
            <Badge variant="secondary">Never connected</Badge>
          )
        }
      />

      <SetupChecklistPanel
        initialChecklist={checklist}
        initialLastSeenAt={lastSeenAt}
        siteUrl={SITE_URL}
      />

      <Reveal delay={0.2}>
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>What the EA enforces</CardTitle>
            <CardDescription>
              Daily loss limit · max trades per day · max open positions · risk per trade · session
              windows. A trade that breaks the charter is closed immediately and logged in the{" "}
              <Link href="/dashboard/violations" className="text-primary hover:underline">
                Violation Centre
              </Link>
              . Rule changes you save here reach the terminal within seconds.
            </CardDescription>
          </CardHeader>
        </Card>
      </Reveal>
    </div>
  );
}

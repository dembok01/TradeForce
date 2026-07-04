import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { Download, KeyRound, MonitorCheck, FolderCog, Globe } from "lucide-react";
import { getEaConnection } from "@/lib/data/api-keys";
import { eaSeenWithin, EA_CONNECTED_WINDOW_MS } from "@/lib/ea-connection";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/reveal";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://trade-force-rouge.vercel.app";

// The compiled EA is dropped into public/downloads/ after each MetaEditor
// build (see ea/README.md); until then the download step shows a notice
// instead of a dead link.
const EA_DOWNLOAD_PATH = "/downloads/TradeForce.ex5";
const eaBinaryAvailable = () => existsSync(join(process.cwd(), "public", EA_DOWNLOAD_PATH));

export default async function EaSetupPage() {
  const { lastSeenAt } = await getEaConnection();
  const connected = eaSeenWithin(lastSeenAt, EA_CONNECTED_WINDOW_MS);
  const hasBinary = eaBinaryAvailable();

  const steps = [
    {
      icon: Download,
      title: "Download the TradeForce EA",
      body: hasBinary ? (
        <>
          <p>Grab the compiled Expert Advisor for MetaTrader 5.</p>
          <Button variant="gold" size="sm" className="mt-3" asChild>
            <a href={EA_DOWNLOAD_PATH} download>
              Download TradeForce.ex5
            </a>
          </Button>
        </>
      ) : (
        <p>
          The compiled <code>TradeForce.ex5</code> will be available for download here shortly.
          If you were given the file directly, continue with step 2.
        </p>
      ),
    },
    {
      icon: FolderCog,
      title: "Install it in MetaTrader 5",
      body: (
        <p>
          In MT5: <strong>File → Open Data Folder</strong>, then copy the file into{" "}
          <code>MQL5/Experts/</code>. Back in MT5, right-click{" "}
          <strong>Expert Advisors</strong> in the Navigator panel and hit{" "}
          <strong>Refresh</strong> — TradeForce appears in the list.
        </p>
      ),
    },
    {
      icon: Globe,
      title: "Allow the EA to reach TradeForce",
      body: (
        <p>
          In MT5: <strong>Tools → Options → Expert Advisors</strong>, tick{" "}
          <strong>“Allow WebRequest for listed URL”</strong> and add:{" "}
          <code className="break-all">{SITE_URL}</code>. Without this, MT5 silently blocks every
          request the EA makes.
        </p>
      ),
    },
    {
      icon: KeyRound,
      title: "Generate your API key",
      body: (
        <p>
          On <Link href="/dashboard/settings" className="text-primary hover:underline">Rule Settings</Link>,
          generate an EA key (shown once — copy it immediately). Drag TradeForce onto the chart you
          trade, and in the inputs dialog paste the key into <code>ApiKey</code> and set{" "}
          <code>ServerUrl</code> to <code className="break-all">{SITE_URL}</code>.
        </p>
      ),
    },
    {
      icon: MonitorCheck,
      title: "Enable AutoTrading and verify",
      body: (
        <p>
          Click <strong>AutoTrading</strong> in the MT5 toolbar so it turns green, and check the{" "}
          <strong>Journal</strong> tab for “TradeForce: config loaded”. Within a minute, the badge
          at the top of this page flips to <strong>Connected</strong> — from then on your rules are
          enforced in the terminal and every trade reports back here automatically.
        </p>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="EA Setup"
        title="Connect your terminal"
        titleEmphasis="terminal"
        description="Five steps from download to live enforcement in MetaTrader 5."
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

      <div className="space-y-4">
        {steps.map((step, i) => (
          <Reveal key={step.title} delay={0.05 * i}>
            <Card>
              <CardHeader className="flex-row items-center gap-3 space-y-0">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/5 font-mono text-sm text-primary">
                  {i + 1}
                </div>
                <div className="flex items-center gap-2">
                  <step.icon className="size-4 text-muted-foreground" />
                  <CardTitle>{step.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{step.body}</CardContent>
            </Card>
          </Reveal>
        ))}
      </div>

      <Reveal delay={0.3}>
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

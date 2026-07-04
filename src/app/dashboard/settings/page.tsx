import Link from "next/link";
import { getTradingPlanStatus } from "@/lib/data/trading-plan";
import { getApiKeys } from "@/lib/data/api-keys";
import { PageHeader } from "@/components/dashboard/page-header";
import { RuleSettingsForm } from "@/components/dashboard/rule-settings-form";
import { ApiKeyManager } from "@/components/dashboard/api-key-manager";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Reveal } from "@/components/motion/reveal";

export default async function SettingsPage() {
  const [{ rules }, apiKeys] = await Promise.all([getTradingPlanStatus(), getApiKeys()]);

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title="Rule settings"
        description="Set your limits once. TradeForce holds you to them from here."
      />

      <Reveal delay={0.05}>
        <RuleSettingsForm rules={rules} />
      </Reveal>

      <Reveal delay={0.12} className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>EA access keys</CardTitle>
            <CardDescription>
              Generate a key, then follow the{" "}
              <Link href="/dashboard/ea-setup" className="text-primary hover:underline">
                EA Setup guide
              </Link>{" "}
              to connect your MetaTrader 5 terminal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ApiKeyManager initialKeys={apiKeys} />
          </CardContent>
        </Card>
      </Reveal>
    </div>
  );
}

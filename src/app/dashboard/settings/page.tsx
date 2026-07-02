import { getTradingPlanStatus } from "@/lib/data/trading-plan";
import { getApiKeys } from "@/lib/data/api-keys";
import { PageHeader } from "@/components/dashboard/page-header";
import { RuleSettingsForm } from "@/components/dashboard/rule-settings-form";
import { ApiKeyManager } from "@/components/dashboard/api-key-manager";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default async function SettingsPage() {
  const [{ rules }, apiKeys] = await Promise.all([getTradingPlanStatus(), getApiKeys()]);

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title="Rule settings"
        description="Set your limits once. TradeForce holds you to them from here."
      />

      <RuleSettingsForm rules={rules} />

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>EA access keys</CardTitle>
          <CardDescription>
            Phase 2 territory — generate a key now so it&apos;s ready when your EA is.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApiKeyManager initialKeys={apiKeys} />
        </CardContent>
      </Card>
    </div>
  );
}

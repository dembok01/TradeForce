import Link from "next/link";
import { getTradingPlanStatus } from "@/lib/data/trading-plan";
import { getApiKeys } from "@/lib/data/api-keys";
import { getProfile } from "@/lib/data/profile";
import { getEntitlement } from "@/lib/data/billing";
import { PageHeader } from "@/components/dashboard/page-header";
import { RuleSettingsForm } from "@/components/dashboard/rule-settings-form";
import { ProfileForm } from "@/components/dashboard/profile-form";
import { ApiKeyManager } from "@/components/dashboard/api-key-manager";
import { PaywallNotice } from "@/components/billing/paywall-notice";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Reveal } from "@/components/motion/reveal";

export default async function SettingsPage() {
  const [{ rules }, apiKeys, profile, entitlement] = await Promise.all([
    getTradingPlanStatus(),
    getApiKeys(),
    getProfile(),
    getEntitlement(),
  ]);

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
            {entitlement.active ? (
              <ApiKeyManager initialKeys={apiKeys} />
            ) : (
              <PaywallNotice
                title="Keys are issued on a paid plan"
                expired={Boolean(entitlement.expiresAt)}
              >
                A key is what lets your terminal talk to us, so it is the one thing we hold back.
                Everything else on this page is yours now — set your rules and they will be
                waiting.
              </PaywallNotice>
            )}
          </CardContent>
        </Card>
      </Reveal>

      {profile && (
        <Reveal delay={0.18} className="mt-8">
          <ProfileForm profile={profile} />
        </Reveal>
      )}
    </div>
  );
}

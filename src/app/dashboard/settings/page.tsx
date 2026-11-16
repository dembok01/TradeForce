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
              For the downloadable EA in funded account mode. Generate a key, then follow the{" "}
              <Link href="/dashboard/ea-setup" className="text-primary hover:underline">
                EA Setup guide
              </Link>{" "}
              to connect your own MetaTrader 5.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {entitlement.active && profile?.connection_route !== "funded" ? (
              // One connection per account: keys are the downloadable EA's, and
              // in normal mode the hosted terminal mints and holds its own.
              <p className="text-sm text-muted-foreground">
                You&apos;re in normal account mode, so the hosted terminal holds its own key and
                there is nothing to manage here. Keys are for funded account mode, which you can
                switch to on the{" "}
                <Link href="/dashboard/ea-setup" className="text-primary hover:underline">
                  EA setup
                </Link>{" "}
                page.
              </p>
            ) : entitlement.active ? (
              <ApiKeyManager initialKeys={apiKeys} />
            ) : (
              <PaywallNotice
                title="Keys are issued on a paid plan"
                expired={Boolean(entitlement.expiresAt)}
              >
                Keys are issued once your plan is active. Your rules save now and will be
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

import { getTradingPlanStatus } from "@/lib/data/trading-plan";
import { formatCurrency } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { RuleStatusBadge } from "@/components/dashboard/rule-status-badge";
import { CharterCallout } from "@/components/dashboard/charter-callout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/motion/reveal";
import { StaggerGroup, StaggerItem } from "@/components/motion/stagger";

// The three limit cards are numbered like the hero's enforcement ledger —
// order is real information here: these are the charter's provisions.
function ProvisionHeader({ index, title }: { index: string; title: string }) {
  return (
    <CardHeader className="flex-row items-baseline gap-3 space-y-0 border-b border-border/60 pb-4">
      <span className="font-mono text-[11px] text-muted-foreground">{index}</span>
      <CardTitle>{title}</CardTitle>
    </CardHeader>
  );
}

export default async function TradingPlanPage() {
  const status = await getTradingPlanStatus();
  const { rules } = status;

  if (!rules) {
    return (
      <div>
        <PageHeader eyebrow="Trading Plan" title="Trading plan status" titleEmphasis="plan" />
        <Reveal y={8}>
          <CharterCallout
            title="No rules configured yet."
            href="/dashboard/settings"
            cta="Set up rules"
          >
            Set your limits on the Rule Settings page to activate enforcement.
          </CharterCallout>
        </Reveal>
      </div>
    );
  }

  const lossUsed = Math.max(0, -status.todayPnl);
  const lossPct = rules.daily_loss_limit ? Math.min(100, (lossUsed / rules.daily_loss_limit) * 100) : 0;
  const tradesPct = rules.max_trades_per_day
    ? Math.min(100, (status.todayTradeCount / rules.max_trades_per_day) * 100)
    : 0;
  const positionsPct = rules.max_open_positions
    ? Math.min(100, (status.openPositionCount / rules.max_open_positions) * 100)
    : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Trading Plan"
        title="Trading plan status"
        titleEmphasis="plan"
        description="How today measures up against the charter you've set."
        action={<RuleStatusBadge status={status.ruleStatus} />}
      />

      <StaggerGroup className="grid gap-4 lg:grid-cols-3">
        <StaggerItem>
          <Card>
            <ProvisionHeader index="01" title="Maximum daily loss" />
            <CardContent className="pt-5">
              {rules.daily_loss_limit ? (
                <>
                  <Progress
                    value={lossPct}
                    animateOnView
                    indicatorClassName={lossPct >= 90 ? "bg-destructive" : lossPct >= 70 ? "bg-warning" : undefined}
                  />
                  <div className="mt-3 flex justify-between font-mono-tabular text-sm">
                    <span className="text-muted-foreground">{formatCurrency(lossUsed)} used</span>
                    <span className="text-foreground">
                      {formatCurrency(Math.max(0, rules.daily_loss_limit - lossUsed))} remaining
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No limit set.</p>
              )}
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card>
            <ProvisionHeader index="02" title="Maximum trades per day" />
            <CardContent className="pt-5">
              {rules.max_trades_per_day ? (
                <>
                  <Progress
                    value={tradesPct}
                    animateOnView
                    animationDelayMs={100}
                    indicatorClassName={tradesPct >= 90 ? "bg-destructive" : tradesPct >= 80 ? "bg-warning" : undefined}
                  />
                  <div className="mt-3 flex justify-between font-mono-tabular text-sm">
                    <span className="text-muted-foreground">{status.todayTradeCount} taken</span>
                    <span className="text-foreground">
                      {Math.max(0, rules.max_trades_per_day - status.todayTradeCount)} remaining
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No cap set.</p>
              )}
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card>
            <ProvisionHeader index="03" title="Maximum open positions" />
            <CardContent className="pt-5">
              {rules.max_open_positions ? (
                <>
                  <Progress
                    value={positionsPct}
                    animateOnView
                    animationDelayMs={200}
                    indicatorClassName={positionsPct >= 100 ? "bg-destructive" : undefined}
                  />
                  <div className="mt-3 flex justify-between font-mono-tabular text-sm">
                    <span className="text-muted-foreground">{status.openPositionCount} open</span>
                    <span className="text-foreground">of {rules.max_open_positions} allowed</span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No limit set.</p>
              )}
            </CardContent>
          </Card>
        </StaggerItem>
      </StaggerGroup>

      <Reveal delay={0.15} className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Allowed trading sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {status.sessions.filter((s) => s.enabled).length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions restricted — trading allowed anytime.</p>
            ) : (
              <ul>
                {status.sessions
                  .filter((s) => s.enabled)
                  .map((session) => (
                    <li key={session.key} className="ledger-row flex items-center justify-between py-3">
                      <span className="text-sm">{session.label}</span>
                      <Badge variant={session.active ? "success" : "secondary"}>
                        {session.active ? "Active now" : "Closed"}
                      </Badge>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </Reveal>
    </div>
  );
}

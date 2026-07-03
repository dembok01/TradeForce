import { getAnalyticsOverview } from "@/lib/data/analytics";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { PnlBarChart } from "@/components/dashboard/pnl-bar-chart";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { CountUp } from "@/components/motion/count-up";
import { Reveal } from "@/components/motion/reveal";
import { StaggerGroup, StaggerItem } from "@/components/motion/stagger";

export default async function AnalyticsPage() {
  const analytics = await getAnalyticsOverview();

  return (
    <div>
      <PageHeader
        eyebrow="Performance"
        title="Analytics"
        description="The record your discipline is actually producing."
      />

      <StaggerGroup className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StaggerItem>
          <StatTile
            label="Win rate"
            value={<CountUp value={analytics.winRatePercent} format="percent" />}
            sublabel="last 6 months"
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Trades this week" value={<CountUp value={analytics.tradesThisWeek} />} />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Trades this month" value={<CountUp value={analytics.tradesThisMonth} />} />
        </StaggerItem>
      </StaggerGroup>

      <div className="mt-8 mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary/80">
          Profit &amp; loss
        </h2>
        <p className="text-xs text-muted-foreground">The record your discipline produced.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Reveal>
          <Card>
            <CardHeader>
              <CardTitle>Daily P/L</CardTitle>
              <CardDescription>Last 7 days</CardDescription>
            </CardHeader>
            <CardContent>
              <PnlBarChart data={analytics.dailyPnl} />
            </CardContent>
          </Card>
        </Reveal>
        <Reveal delay={0.08}>
          <Card>
            <CardHeader>
              <CardTitle>Weekly P/L</CardTitle>
              <CardDescription>Last 8 weeks</CardDescription>
            </CardHeader>
            <CardContent>
              <PnlBarChart data={analytics.weeklyPnl} />
            </CardContent>
          </Card>
        </Reveal>
        <Reveal delay={0.16}>
          <Card>
            <CardHeader>
              <CardTitle>Monthly P/L</CardTitle>
              <CardDescription>Last 6 months</CardDescription>
            </CardHeader>
            <CardContent>
              <PnlBarChart data={analytics.monthlyPnl} />
            </CardContent>
          </Card>
        </Reveal>
      </div>
    </div>
  );
}

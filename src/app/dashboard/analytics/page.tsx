import { getAnalyticsOverview } from "@/lib/data/analytics";
import { formatPercent } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { PnlBarChart } from "@/components/dashboard/pnl-bar-chart";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default async function AnalyticsPage() {
  const analytics = await getAnalyticsOverview();

  return (
    <div>
      <PageHeader
        eyebrow="Performance"
        title="Analytics"
        description="The record your discipline is actually producing."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Win rate" value={formatPercent(analytics.winRatePercent)} sublabel="last 6 months" />
        <StatTile label="Trades this week" value={String(analytics.tradesThisWeek)} />
        <StatTile label="Trades this month" value={String(analytics.tradesThisMonth)} />
      </div>

      <div className="mt-8 mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary/80">
          Profit &amp; loss
        </h2>
        <p className="text-xs text-muted-foreground">The record your discipline produced.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Daily P/L</CardTitle>
            <CardDescription>Last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <PnlBarChart data={analytics.dailyPnl} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Weekly P/L</CardTitle>
            <CardDescription>Last 8 weeks</CardDescription>
          </CardHeader>
          <CardContent>
            <PnlBarChart data={analytics.weeklyPnl} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Monthly P/L</CardTitle>
            <CardDescription>Last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <PnlBarChart data={analytics.monthlyPnl} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

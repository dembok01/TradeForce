import Link from "next/link";
import { getDashboardOverview } from "@/lib/data/dashboard";
import { getDisciplineScore } from "@/lib/data/discipline";
import { formatCurrency, formatSignedCurrency } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { DisciplineGauge } from "@/components/dashboard/discipline-gauge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function DashboardHomePage() {
  const [overview, discipline] = await Promise.all([getDashboardOverview(), getDisciplineScore()]);
  const isConfigured = overview.status !== "not_configured";

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Account status"
        description="A snapshot of today. Numbers here fill in once your EA starts reporting — until then, this reflects trades you've logged manually."
        action={<StatusBadge status={overview.status} />}
      />

      {!isConfigured && (
        <div className="mb-8 rounded-xl border border-primary/30 bg-primary/5 p-5">
          <p className="font-display text-base font-medium">Your charter isn&apos;t set yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure a daily loss limit, trade cap, and session window to start enforcement.
          </p>
          <Button variant="gold" size="sm" className="mt-4" asChild>
            <Link href="/dashboard/settings">Set up rules</Link>
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Current equity"
          value={overview.currentEquity !== null ? formatCurrency(overview.currentEquity) : null}
          emptyHint="Not yet reported by an EA"
        />
        <StatTile
          label="Today's P/L"
          value={overview.hasTradesData ? formatSignedCurrency(overview.todayPnl) : null}
          emptyHint="No trades logged today"
          accent={
            overview.hasTradesData ? (overview.todayPnl >= 0 ? "success" : "destructive") : "neutral"
          }
        />
        <StatTile
          label="Daily loss remaining"
          value={
            overview.dailyLossRemaining !== null ? formatCurrency(overview.dailyLossRemaining) : null
          }
          sublabel={
            overview.dailyLossLimit !== null ? `of ${formatCurrency(overview.dailyLossLimit)} limit` : undefined
          }
          emptyHint="No daily loss limit set"
        />
        <StatTile
          label="Trades taken today"
          value={String(overview.todayTradeCount)}
          sublabel={overview.todayTradeCount === 0 ? undefined : "logged manually"}
        />
        <StatTile
          label="Trades remaining today"
          value={overview.tradesRemainingToday !== null ? String(overview.tradesRemainingToday) : null}
          sublabel={
            overview.maxTradesPerDay !== null ? `of ${overview.maxTradesPerDay} allowed` : undefined
          }
          emptyHint="No trade cap set"
        />
        <StatTile
          label="Violations prevented"
          value={String(overview.violationsAllTime)}
          sublabel="all time"
        />
        <StatTile
          label="Account status"
          value={isConfigured ? overview.status.replace("_", " ") : null}
          emptyHint="Awaiting rule configuration"
          accent={
            overview.status === "safe"
              ? "success"
              : overview.status === "warning"
                ? "warning"
                : overview.status === "locked"
                  ? "destructive"
                  : "neutral"
          }
        />
      </div>

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Discipline score</CardTitle>
            <CardDescription>
              {discipline.isEstimate ? "Estimated from the last 30 days." : "Computed today."}
            </CardDescription>
          </div>
          <Link href="/dashboard/violations" className="text-xs text-primary hover:underline">
            View breakdown →
          </Link>
        </CardHeader>
        <CardContent>
          <DisciplineGauge score={discipline.total} size={140} />
        </CardContent>
      </Card>
    </div>
  );
}

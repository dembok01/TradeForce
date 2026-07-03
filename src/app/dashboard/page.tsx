import Link from "next/link";
import { getDashboardOverview } from "@/lib/data/dashboard";
import { getDisciplineScore } from "@/lib/data/discipline";
import { formatCurrency } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { DisciplineGauge } from "@/components/dashboard/discipline-gauge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/motion/count-up";
import { Reveal } from "@/components/motion/reveal";
import { StaggerGroup, StaggerItem } from "@/components/motion/stagger";

export default async function DashboardHomePage() {
  const [overview, discipline] = await Promise.all([getDashboardOverview(), getDisciplineScore()]);
  const isConfigured = overview.status !== "not_configured";

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Account status"
        titleEmphasis="status"
        description="A snapshot of today. Numbers here fill in once your EA starts reporting — until then, this reflects trades you've logged manually."
        action={
          <span data-tour-id="status-badge">
            <StatusBadge status={overview.status} />
          </span>
        }
      />

      {!isConfigured && (
        <Reveal y={8} className="mb-8">
          <div className="border-gold-glow rounded-xl border border-primary/30 bg-primary/5 p-5">
            <p className="font-display text-base font-medium">Your charter isn&apos;t set yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure a daily loss limit, trade cap, and session window to start enforcement.
            </p>
            <Button variant="gold" size="sm" className="mt-4" asChild>
              <Link href="/dashboard/settings">Set up rules</Link>
            </Button>
          </div>
        </Reveal>
      )}

      <StaggerGroup
        data-tour-id="stat-grid"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <StaggerItem>
          <StatTile
            label="Current equity"
            value={
              overview.currentEquity !== null ? (
                <CountUp value={overview.currentEquity} format="currency" />
              ) : null
            }
            emptyHint="Not yet reported by an EA"
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Today's P/L"
            value={
              overview.hasTradesData ? (
                <CountUp value={overview.todayPnl} format="signedCurrency" />
              ) : null
            }
            emptyHint="No trades logged today"
            accent={
              overview.hasTradesData
                ? overview.todayPnl >= 0
                  ? "success"
                  : "destructive"
                : "neutral"
            }
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Daily loss remaining"
            value={
              overview.dailyLossRemaining !== null ? (
                <CountUp value={overview.dailyLossRemaining} format="currency" />
              ) : null
            }
            sublabel={
              overview.dailyLossLimit !== null
                ? `of ${formatCurrency(overview.dailyLossLimit)} limit`
                : undefined
            }
            emptyHint="No daily loss limit set"
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Trades taken today"
            value={<CountUp value={overview.todayTradeCount} />}
            sublabel={overview.todayTradeCount === 0 ? undefined : "logged manually"}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Trades remaining today"
            value={
              overview.tradesRemainingToday !== null ? (
                <CountUp value={overview.tradesRemainingToday} />
              ) : null
            }
            sublabel={
              overview.maxTradesPerDay !== null ? `of ${overview.maxTradesPerDay} allowed` : undefined
            }
            emptyHint="No trade cap set"
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Violations prevented"
            value={<CountUp value={overview.violationsAllTime} />}
            sublabel="all time"
          />
        </StaggerItem>
        <StaggerItem>
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
        </StaggerItem>
      </StaggerGroup>

      <Reveal delay={0.15} className="mt-4">
        <Card data-tour-id="discipline-gauge">
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
      </Reveal>
    </div>
  );
}

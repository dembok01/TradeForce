import { fromZonedTime } from "date-fns-tz";
import { getTrades } from "@/lib/data/trades";
import { getEaConnection } from "@/lib/data/api-keys";
import { getAnalyticsOverview } from "@/lib/data/analytics";
import { getRequestTimezone } from "@/lib/data/rules";
import { PageHeader } from "@/components/dashboard/page-header";
import { TradeFormDialog } from "@/components/dashboard/trade-form-dialog";
import { TradeTable } from "@/components/dashboard/trade-table";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { StatTile } from "@/components/dashboard/stat-tile";
import { PnlBarChart } from "@/components/dashboard/pnl-bar-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CountUp } from "@/components/motion/count-up";
import { Reveal } from "@/components/motion/reveal";
import { StaggerGroup, StaggerItem } from "@/components/motion/stagger";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// A filter day is the trader's calendar day, not UTC's: an IST "Oct 1" starts
// at 18:30 UTC on Sep 30. Anything that isn't yyyy-MM-dd is ignored rather than
// crashing the page on a hand-edited URL.
function dayBound(day: string | undefined, edge: "start" | "end", tz: string): string | undefined {
  if (!day || !DAY.test(day)) return undefined;
  const instant = fromZonedTime(`${day}T${edge === "start" ? "00:00:00" : "23:59:59.999"}`, tz);
  return Number.isNaN(instant.getTime()) ? undefined : instant.toISOString();
}

const CHARTS = [
  { key: "dailyPnl", title: "Daily P/L", description: "Last 7 days" },
  { key: "weeklyPnl", title: "Weekly P/L", description: "Last 8 weeks" },
  { key: "monthlyPnl", title: "Monthly P/L", description: "Last 6 months" },
] as const;

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const [{ from, to }, timezone] = await Promise.all([searchParams, getRequestTimezone()]);
  const [trades, eaConnection, analytics] = await Promise.all([
    getTrades({ from: dayBound(from, "start", timezone), to: dayBound(to, "end", timezone) }),
    getEaConnection(),
    getAnalyticsOverview(),
  ]);
  const { manualEntryLocked } = eaConnection;

  return (
    <div>
      <PageHeader
        eyebrow="Journal"
        title="Journal & analytics"
        description={
          manualEntryLocked
            ? "Your EA is reporting trades automatically — manual entry is off so the record stays verified."
            : "Every trade, the notes that explain it, and the record it adds up to."
        }
        action={manualEntryLocked ? undefined : <TradeFormDialog />}
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

      <h2 className="mb-3 mt-8 font-mono text-[11px] uppercase tracking-[0.2em] text-primary/80">
        Profit &amp; loss
      </h2>
      <div className="grid gap-4 lg:grid-cols-3">
        {CHARTS.map((chart, i) => (
          <Reveal key={chart.key} delay={i * 0.08}>
            <Card>
              <CardHeader>
                <CardTitle>{chart.title}</CardTitle>
                <CardDescription>{chart.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <PnlBarChart data={analytics[chart.key]} />
              </CardContent>
            </Card>
          </Reveal>
        ))}
      </div>

      <div className="mb-3 mt-8 flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary/80">Trade log</h2>
        <DateRangeFilter />
      </div>
      <Card>
        <CardContent className="pt-6">
          <TradeTable trades={trades} manualEntryLocked={manualEntryLocked} />
        </CardContent>
      </Card>
    </div>
  );
}

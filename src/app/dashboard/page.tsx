import Link from "next/link";
import { Suspense } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Activity } from "lucide-react";
import { eaSeenWithin, EA_CONNECTED_WINDOW_MS } from "@/lib/ea-connection";
import { getDashboardOverview } from "@/lib/data/dashboard";
import { getDisciplineScore } from "@/lib/data/discipline";
import { getEnforcementFeed } from "@/lib/data/feed";
import { getEquitySparkline } from "@/lib/data/equity";
import { getProfile } from "@/lib/data/profile";
import { getAccountRules, getRequestTimezone } from "@/lib/data/rules";
import { SESSION_WINDOWS, parseTimeToUtcHours } from "@/lib/trading-sessions";
import { formatCurrency } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { DisciplineGauge } from "@/components/dashboard/discipline-gauge";
import { DisciplineBreakdown } from "@/components/dashboard/discipline-breakdown";
import { CharterCallout } from "@/components/dashboard/charter-callout";
import { TodayStrip, type SessionWindow } from "@/components/dashboard/today-strip";
import { EnforcementFeed } from "@/components/dashboard/enforcement-feed";
import { EquitySparkline } from "@/components/dashboard/equity-sparkline";
import { CardSkeleton, ChartCardSkeleton } from "@/components/dashboard/skeletons";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { WidgetBoundary } from "@/components/ui/widget-boundary";
import { CountUp } from "@/components/motion/count-up";
import { Reveal } from "@/components/motion/reveal";
import { StaggerGroup, StaggerItem } from "@/components/motion/stagger";

export default async function DashboardHomePage() {
  const [overview, discipline, profile, timezone, rules] = await Promise.all([
    getDashboardOverview(),
    getDisciplineScore(),
    getProfile(),
    getRequestTimezone(),
    getAccountRules(),
  ]);
  const isConfigured = overview.status !== "not_configured";

  const eaLastSeen = overview.eaLastSeenAt ? new Date(overview.eaLastSeenAt) : null;
  const eaIsLive = eaSeenWithin(overview.eaLastSeenAt, EA_CONNECTED_WINDOW_MS);

  // Greeting on the trader's clock, not the server's.
  const hour = toZonedTime(new Date(), timezone).getHours();
  const daypart = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? null;
  const firmLabel = profile?.prop_firm ? `${profile.prop_firm} account` : "account";

  const sessionWindows: SessionWindow[] = rules
    ? [
        ...(rules.session_london_enabled ? [{ ...SESSION_WINDOWS.london }] : []),
        ...(rules.session_new_york_enabled ? [{ ...SESSION_WINDOWS.newYork }] : []),
        ...(rules.session_asian_enabled ? [{ ...SESSION_WINDOWS.asian }] : []),
        ...(rules.session_london_ny_overlap_enabled ? [{ ...SESSION_WINDOWS.londonNyOverlap }] : []),
        ...(rules.custom_session_start && rules.custom_session_end
          ? [
              {
                label: "Custom window",
                startUtc: parseTimeToUtcHours(rules.custom_session_start),
                endUtc: parseTimeToUtcHours(rules.custom_session_end),
              },
            ]
          : []),
      ]
    : [];

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Account status"
        titleEmphasis="status"
        description={`Good ${daypart}${firstName ? `, ${firstName}` : ""} — here's where your ${firmLabel} stands right now.`}
        action={<StatusBadge status={overview.status} />}
      />

      {!eaIsLive && (
        <Reveal y={8} className="mb-8">
          <CharterCallout
            title="Your rules aren't being enforced yet."
            href="/dashboard/ea-setup"
            cta="Connect your account"
          >
            Connect your MetaTrader account and we run your terminal for you, day and night.
            Until then nothing is watching your trades.
          </CharterCallout>
        </Reveal>
      )}

      {!isConfigured && (
        <Reveal y={8} className="mb-8">
          <CharterCallout
            title="Your charter isn't set yet."
            href="/dashboard/settings"
            cta="Set up rules"
          >
            Configure a daily loss limit, trade cap, and session window to start enforcement.
          </CharterCallout>
        </Reveal>
      )}

      {isConfigured && (
        <TodayStrip
          timezone={timezone}
          status={overview.status}
          tradesRemaining={overview.tradesRemainingToday}
          lossHeadroom={overview.dailyLossRemaining}
          sessions={sessionWindows}
        />
      )}

      <StaggerGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          <StatTile label="Trades taken today" value={<CountUp value={overview.todayTradeCount} />} />
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
        <StaggerItem>
          <StatTile
            label="EA connection"
            value={
              eaLastSeen
                ? eaIsLive
                  ? "Connected"
                  : `Last seen ${formatDistanceToNowStrict(eaLastSeen, { addSuffix: true })}`
                : null
            }
            sublabel={
              eaLastSeen && eaIsLive
                ? `checked in ${formatDistanceToNowStrict(eaLastSeen, { addSuffix: true })}`
                : undefined
            }
            emptyHint="No EA has connected yet"
            accent={eaLastSeen ? (eaIsLive ? "success" : "warning") : "neutral"}
          />
        </StaggerItem>
      </StaggerGroup>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <WidgetBoundary label="The equity curve">
            <Suspense fallback={<ChartCardSkeleton />}>
              <EquityCard violationTimes={discipline.recentViolations.map((v) => v.occurred_at)} />
            </Suspense>
          </WidgetBoundary>
          <WidgetBoundary label="The enforcement feed">
            <Suspense fallback={<CardSkeleton />}>
              <FeedCard />
            </Suspense>
          </WidgetBoundary>
        </div>

        <Reveal delay={0.15}>
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Discipline score</CardTitle>
                <CardDescription>
                  {discipline.isEstimate ? "Estimated from the last 30 days." : "Computed today."}{" "}
                  Tap the gauge for the arithmetic.
                </CardDescription>
              </div>
              <Link href="/dashboard/violations" className="shrink-0 text-xs text-primary hover:underline">
                Violation centre →
              </Link>
            </CardHeader>
            <CardContent>
              <DisciplineBreakdown discipline={discipline}>
                <div className="flex justify-center">
                  <DisciplineGauge score={discipline.total} size={140} />
                </div>
              </DisciplineBreakdown>
            </CardContent>
          </Card>
        </Reveal>
      </div>
    </div>
  );
}

async function EquityCard({ violationTimes }: { violationTimes: string[] }) {
  const points = await getEquitySparkline();
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Equity — last 24h</CardTitle>
          <CardDescription>Reported by your EA every minute while connected.</CardDescription>
        </div>
        {violationTimes.length > 0 && points.length > 1 && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-3 w-0 border-l border-dashed border-destructive" />
            violation
          </span>
        )}
      </CardHeader>
      <CardContent>
        <EquitySparkline points={points} violationTimes={violationTimes} />
      </CardContent>
    </Card>
  );
}

async function FeedCard() {
  const events = await getEnforcementFeed();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Enforcement feed</CardTitle>
        <CardDescription>Trades and violations, as the terminal reports them.</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <EmptyState title="Nothing on the wire yet" icon={Activity} className="py-6">
            Once your EA is connected, every trade and every blocked violation ticks in here live.
          </EmptyState>
        ) : (
          <EnforcementFeed events={events} />
        )}
      </CardContent>
    </Card>
  );
}

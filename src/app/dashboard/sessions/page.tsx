import { getTradingPlanStatus } from "@/lib/data/trading-plan";
import { getRequestTimezone } from "@/lib/data/rules";
import { SESSION_WINDOWS, parseTimeToUtcHours } from "@/lib/trading-sessions";
import { PageHeader } from "@/components/dashboard/page-header";
import { SessionControlForm } from "@/components/dashboard/session-control-form";
import { SessionTimeline, type TimelineSession } from "@/components/dashboard/session-timeline";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Reveal } from "@/components/motion/reveal";

export default async function SessionsPage() {
  const [{ rules, sessions }, timezone] = await Promise.all([
    getTradingPlanStatus(),
    getRequestTimezone(),
  ]);

  const timelineSessions: TimelineSession[] = [
    { key: "london", ...SESSION_WINDOWS.london, enabled: rules?.session_london_enabled ?? false },
    { key: "newYork", ...SESSION_WINDOWS.newYork, enabled: rules?.session_new_york_enabled ?? false },
    { key: "asian", ...SESSION_WINDOWS.asian, enabled: rules?.session_asian_enabled ?? false },
    {
      key: "overlap",
      ...SESSION_WINDOWS.londonNyOverlap,
      label: "LDN/NY overlap",
      enabled: rules?.session_london_ny_overlap_enabled ?? false,
    },
    ...(rules?.custom_session_start && rules?.custom_session_end
      ? [
          {
            key: "custom",
            label: "Custom window",
            enabled: true,
            startUtc: parseTimeToUtcHours(rules.custom_session_start),
            endUtc: parseTimeToUtcHours(rules.custom_session_end),
          },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Sessions"
        title="Session control"
        description="Restrict enforcement to specific trading hours. Outside an allowed window, opening a position counts as a violation."
      />

      <Reveal>
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Your trading day</CardTitle>
            <CardDescription>
              Windows on your local clock ({timezone}); the line is now. Gold windows are enforced.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SessionTimeline sessions={timelineSessions} timezone={timezone} />
          </CardContent>
        </Card>
      </Reveal>

      <Reveal delay={0.05}>
        <SessionControlForm rules={rules} sessions={sessions} />
      </Reveal>
    </div>
  );
}

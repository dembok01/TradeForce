import { format } from "date-fns";
import { ShieldCheck } from "lucide-react";
import { getViolationsOverview, VIOLATION_LABELS } from "@/lib/data/violations";
import { getDisciplineScore } from "@/lib/data/discipline";
import { PageHeader } from "@/components/dashboard/page-header";
import { DisciplineGauge } from "@/components/dashboard/discipline-gauge";
import { FactorMeter } from "@/components/dashboard/factor-meter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal } from "@/components/motion/reveal";
import {
  LedgerTable,
  LedgerHeaderRow,
  LedgerHeaderCell,
  LedgerRow,
  LedgerCell,
} from "@/components/ui/ledger-table";

export default async function ViolationsPage() {
  const [overview, discipline] = await Promise.all([getViolationsOverview(), getDisciplineScore()]);

  return (
    <div>
      <PageHeader
        eyebrow="Enforcement"
        title="Violation centre"
        description="Every breach TradeForce catches, and the discipline score it produces."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Reveal className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Discipline score</CardTitle>
              <CardDescription>
                {discipline.isEstimate
                  ? "Estimated from the last 30 days — no EA-reported score yet."
                  : "Computed today."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-6">
              <DisciplineGauge score={discipline.total} />
              <div className="w-full space-y-4">
                <FactorMeter label="Rule adherence" score={discipline.ruleAdherence} animationDelayMs={150} />
                <FactorMeter label="Session adherence" score={discipline.sessionAdherence} animationDelayMs={250} />
                <FactorMeter
                  label="Overtrading prevention"
                  score={discipline.overtradingPrevention}
                  animationDelayMs={350}
                />
                <FactorMeter label="Risk management" score={discipline.riskManagement} animationDelayMs={450} />
              </div>
            </CardContent>
          </Card>
        </Reveal>

        <Reveal delay={0.08} className="lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Recent violations</CardTitle>
                <CardDescription>Most recent 50, newest first.</CardDescription>
              </div>
              <div className="flex gap-2 font-mono-tabular text-xs">
                <Badge variant="secondary">{overview.countThisWeek} this week</Badge>
                <Badge variant="secondary">{overview.countThisMonth} this month</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {overview.recent.length === 0 ? (
                <EmptyState title="No breaches on record" icon={ShieldCheck}>
                  Once your EA is connected, any rule breach appears here the moment it happens.
                </EmptyState>
              ) : (
                <LedgerTable>
                  <thead>
                    <LedgerHeaderRow>
                      <LedgerHeaderCell>Type</LedgerHeaderCell>
                      <LedgerHeaderCell>Timestamp</LedgerHeaderCell>
                      <LedgerHeaderCell className="pr-0">Details</LedgerHeaderCell>
                    </LedgerHeaderRow>
                  </thead>
                  <tbody>
                    {overview.recent.map((v) => (
                      <LedgerRow key={v.id}>
                        <LedgerCell>
                          <Badge variant="destructive">{VIOLATION_LABELS[v.type]}</Badge>
                        </LedgerCell>
                        <LedgerCell mono className="text-muted-foreground">
                          {format(new Date(v.occurred_at), "MMM d, yyyy HH:mm")}
                        </LedgerCell>
                        <LedgerCell className="pr-0 text-muted-foreground">
                          {v.details && Object.keys(v.details as object).length > 0
                            ? JSON.stringify(v.details)
                            : "—"}
                        </LedgerCell>
                      </LedgerRow>
                    ))}
                  </tbody>
                </LedgerTable>
              )}
            </CardContent>
          </Card>
        </Reveal>
      </div>
    </div>
  );
}

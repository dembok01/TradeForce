"use client";

import { format } from "date-fns";
import { VIOLATION_PENALTY } from "@/lib/discipline-score";
import { VIOLATION_LABELS, explainViolation } from "@/lib/violation-explainers";
import type { DisciplineFactors, DisciplineViolation } from "@/lib/data/discipline";
import type { ViolationType } from "@/lib/supabase/database.types";
import { FactorMeter } from "@/components/dashboard/factor-meter";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

// Which violation types feed each factor — mirrors disciplineFromViolationCounts.
const FACTORS: {
  key: keyof Pick<
    DisciplineFactors,
    "ruleAdherence" | "sessionAdherence" | "overtradingPrevention" | "riskManagement"
  >;
  label: string;
  types: ViolationType[];
}[] = [
  { key: "ruleAdherence", label: "Rule adherence", types: ["DAILY_LOSS_BREACH", "OPEN_POSITIONS_BREACH"] },
  { key: "sessionAdherence", label: "Session adherence", types: ["OUTSIDE_SESSION"] },
  { key: "overtradingPrevention", label: "Overtrading prevention", types: ["OVERTRADING"] },
  { key: "riskManagement", label: "Risk management", types: ["RISK_PER_TRADE_BREACH"] },
];

const SHOWN_PER_FACTOR = 4;

/**
 * Wraps a gauge (or anything else) so tapping it opens the arithmetic behind
 * the score: which violations, in which factor, costing how many points.
 * Surfacing math that's already computed — nothing here is a new estimate.
 */
export function DisciplineBreakdown({
  discipline,
  children,
}: {
  discipline: DisciplineFactors;
  children: React.ReactNode;
}) {
  return (
    <Sheet>
      <SheetTrigger
        className="group block w-full cursor-pointer rounded-lg outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-label="Show the discipline score breakdown"
      >
        {children}
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            Discipline score — {Math.round(discipline.total)}
            <span className="text-muted-foreground">/100</span>
          </SheetTitle>
          <SheetDescription>
            Each factor starts at 100 and loses {VIOLATION_PENALTY} points per violation in the
            last 30 days. The total is the average of the four factors
            {discipline.isEstimate ? " (live estimate)" : ""}.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          {FACTORS.map((factor) => {
            const count = factor.types.reduce((sum, t) => sum + discipline.counts[t], 0);
            const score = discipline[factor.key];
            const violations = discipline.recentViolations.filter((v) =>
              factor.types.includes(v.type)
            );
            return (
              <div key={factor.key}>
                <FactorMeter label={factor.label} score={score} />
                <p className="mt-1.5 font-mono-tabular text-xs text-muted-foreground">
                  {count === 0
                    ? "No violations — full marks."
                    : `${count} × −${VIOLATION_PENALTY} pts → ${Math.round(score)}/100`}
                </p>
                {violations.length > 0 && (
                  <ul className="mt-2 space-y-2">
                    {violations.slice(0, SHOWN_PER_FACTOR).map((v: DisciplineViolation) => (
                      <li key={v.id} className="ledger-row py-2 text-xs">
                        <p className="text-foreground">{explainViolation(v)}</p>
                        <p className="mt-0.5 text-muted-foreground">
                          {VIOLATION_LABELS[v.type]} ·{" "}
                          {format(new Date(v.occurred_at), "MMM d, HH:mm")}
                        </p>
                      </li>
                    ))}
                    {violations.length > SHOWN_PER_FACTOR && (
                      <li className="text-xs text-muted-foreground">
                        +{violations.length - SHOWN_PER_FACTOR} more in the Violation Centre
                      </li>
                    )}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

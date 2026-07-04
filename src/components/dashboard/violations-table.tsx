"use client";

import { Fragment, useState } from "react";
import { format } from "date-fns";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import type { Violation } from "@/lib/data/violations";
import {
  VIOLATION_LABELS,
  explainViolation,
  violationAction,
  violationFigures,
} from "@/lib/violation-explainers";
import { Badge } from "@/components/ui/badge";
import {
  LedgerTable,
  LedgerHeaderRow,
  LedgerHeaderCell,
  LedgerCell,
  LEDGER_ROW_CLASSES,
} from "@/components/ui/ledger-table";
import { cn } from "@/lib/utils";

// Each row reads as a sentence built from the numbers that triggered it;
// expanding a row shows the full incident (rule, figures, what the EA did).
export function ViolationsTable({ violations }: { violations: Violation[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <LedgerTable className="min-w-[640px]">
      <thead>
        <LedgerHeaderRow>
          <LedgerHeaderCell>Type</LedgerHeaderCell>
          <LedgerHeaderCell>Timestamp</LedgerHeaderCell>
          <LedgerHeaderCell>What happened</LedgerHeaderCell>
          <LedgerHeaderCell className="pr-0" />
        </LedgerHeaderRow>
      </thead>
      <tbody>
        {violations.map((v) => {
          const open = openId === v.id;
          const figures = violationFigures(v);
          return (
            <Fragment key={v.id}>
              <tr
                className={cn(LEDGER_ROW_CLASSES, "cursor-pointer", open && "border-primary/20")}
                onClick={() => setOpenId(open ? null : v.id)}
                aria-expanded={open}
              >
                <LedgerCell>
                  <Badge variant="destructive">{VIOLATION_LABELS[v.type]}</Badge>
                </LedgerCell>
                <LedgerCell mono className="whitespace-nowrap text-muted-foreground">
                  {format(new Date(v.occurred_at), "MMM d, yyyy HH:mm")}
                </LedgerCell>
                <LedgerCell className="text-muted-foreground">{explainViolation(v)}</LedgerCell>
                <LedgerCell className="pr-0">
                  <ChevronDown
                    className={cn(
                      "size-4 text-muted-foreground transition-transform",
                      open && "rotate-180"
                    )}
                  />
                </LedgerCell>
              </tr>
              <tr aria-hidden={!open}>
                <td colSpan={4} className="p-0">
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-3 border-b border-border/60 bg-background/40 px-4 py-4 text-sm">
                          <p className="text-muted-foreground">{violationAction(v.type)}</p>
                          {figures.length > 0 && (
                            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
                              {figures.map((f) => (
                                <div key={f.label}>
                                  <dt className="text-xs text-muted-foreground">{f.label}</dt>
                                  <dd className="font-mono-tabular text-sm">{f.value}</dd>
                                </div>
                              ))}
                            </dl>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </td>
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </LedgerTable>
  );
}

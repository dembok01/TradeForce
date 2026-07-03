import * as React from "react";
import { cn } from "@/lib/utils";

// The dashboard's audit-trail treatment: hairline rows, mono uppercase column
// labels, tabular numerics — so trade and violation records read like the
// enforcement ledger the landing page establishes, not a generic data grid.

function LedgerTable({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}

function LedgerHeaderRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b border-border text-left font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

function LedgerHeaderCell({
  className,
  sticky,
  ...props
}: React.ComponentProps<"th"> & { sticky?: boolean }) {
  return (
    <th
      className={cn("pb-2 pr-4 font-normal", sticky && "sticky left-0 z-10 bg-card", className)}
      {...props}
    />
  );
}

// Exported so client tables can render motion.tr rows with the same treatment.
const LEDGER_ROW_CLASSES =
  "border-b border-border/60 align-top transition-colors last:border-0 hover:bg-secondary/30";

function LedgerRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn(LEDGER_ROW_CLASSES, className)} {...props} />;
}

function LedgerCell({
  className,
  mono,
  sticky,
  ...props
}: React.ComponentProps<"td"> & { mono?: boolean; sticky?: boolean }) {
  return (
    <td
      className={cn(
        "py-2.5 pr-4",
        mono && "font-mono-tabular",
        sticky && "sticky left-0 z-10 bg-card",
        className
      )}
      {...props}
    />
  );
}

export { LedgerTable, LedgerHeaderRow, LedgerHeaderCell, LedgerRow, LedgerCell, LEDGER_ROW_CLASSES };

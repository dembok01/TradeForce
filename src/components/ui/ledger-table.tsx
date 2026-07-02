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

function LedgerHeaderCell({ className, ...props }: React.ComponentProps<"th">) {
  return <th className={cn("pb-2 pr-4 font-normal", className)} {...props} />;
}

function LedgerRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b border-border/60 align-top transition-colors last:border-0 hover:bg-secondary/30",
        className
      )}
      {...props}
    />
  );
}

function LedgerCell({
  className,
  mono,
  ...props
}: React.ComponentProps<"td"> & { mono?: boolean }) {
  return <td className={cn("py-2.5 pr-4", mono && "font-mono-tabular", className)} {...props} />;
}

export { LedgerTable, LedgerHeaderRow, LedgerHeaderCell, LedgerRow, LedgerCell };

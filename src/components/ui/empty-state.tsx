import * as React from "react";
import { cn } from "@/lib/utils";

// A deliberate, on-brand empty state — an invitation to act, not a dead end.
export function EmptyState({
  title,
  icon: Icon,
  className,
  action,
  children,
}: {
  title?: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center",
        className
      )}
    >
      {Icon && (
        <span className="empty-state-icon mb-3 flex size-9 items-center justify-center rounded-full bg-secondary text-muted-foreground ring-1 ring-primary/15">
          <Icon className="size-4" />
        </span>
      )}
      {title && <p className="font-display text-sm font-medium text-foreground">{title}</p>}
      {children && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

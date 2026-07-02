import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Shared, route-shaped skeleton pieces so each dashboard loading.tsx composes
// the real layout's silhouette rather than a generic spinner.

export function HeaderSkeleton({ hasAction = false }: { hasAction?: boolean }) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {hasAction && <Skeleton className="h-8 w-28" />}
    </div>
  );
}

export function StatTileSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-4 h-7 w-24" />
      <Skeleton className="mt-2 h-3 w-16" />
    </div>
  );
}

export function StatGridSkeleton({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <StatTileSkeleton key={i} />
      ))}
    </div>
  );
}

export function MeterSkeleton() {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-10" />
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
    </div>
  );
}

export function CardSkeleton({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-56" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

export function GaugeCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-3 w-48" />
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-6">
        <Skeleton className="h-24 w-44 rounded-t-full" />
        <div className="w-full space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <MeterSkeleton key={i} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-4 border-b border-border pb-2">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 py-1">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ChartCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-3 w-20" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-48 w-full" />
      </CardContent>
    </Card>
  );
}

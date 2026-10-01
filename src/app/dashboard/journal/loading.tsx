import {
  ChartCardSkeleton,
  HeaderSkeleton,
  StatGridSkeleton,
  TableSkeleton,
} from "@/components/dashboard/skeletons";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <HeaderSkeleton hasAction />
      <StatGridSkeleton count={3} className="sm:grid-cols-3 lg:grid-cols-3" />
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <ChartCardSkeleton key={i} />
        ))}
      </div>
      <div className="mb-4 mt-8 flex flex-wrap items-end justify-end gap-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-32" />
      </div>
      <Card>
        <CardContent className="pt-6">
          <TableSkeleton rows={8} cols={7} />
        </CardContent>
      </Card>
    </div>
  );
}

import { HeaderSkeleton, GaugeCardSkeleton, TableSkeleton } from "@/components/dashboard/skeletons";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <HeaderSkeleton />
      <div className="grid gap-4 lg:grid-cols-3">
        <GaugeCardSkeleton className="lg:col-span-1" />
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <TableSkeleton rows={6} cols={3} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

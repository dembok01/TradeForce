import { HeaderSkeleton, StatGridSkeleton } from "@/components/dashboard/skeletons";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <HeaderSkeleton />
      <StatGridSkeleton count={7} />
      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="space-y-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-3 w-24" />
        </CardHeader>
        <CardContent className="flex justify-center">
          <Skeleton className="h-24 w-44 rounded-t-full" />
        </CardContent>
      </Card>
    </div>
  );
}

import { HeaderSkeleton, TableSkeleton } from "@/components/dashboard/skeletons";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <HeaderSkeleton hasAction />
      <div className="mb-4 flex flex-wrap items-end gap-3">
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

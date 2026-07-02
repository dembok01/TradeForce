import { HeaderSkeleton, CardSkeleton } from "@/components/dashboard/skeletons";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <HeaderSkeleton />
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-64" />
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Skeleton className="h-11 w-40" />
      </div>
      <CardSkeleton className="mt-8" lines={2} />
    </div>
  );
}

import { HeaderSkeleton, StatGridSkeleton, ChartCardSkeleton } from "@/components/dashboard/skeletons";

export default function Loading() {
  return (
    <div>
      <HeaderSkeleton />
      <StatGridSkeleton count={3} className="sm:grid-cols-3 lg:grid-cols-3" />
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <ChartCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

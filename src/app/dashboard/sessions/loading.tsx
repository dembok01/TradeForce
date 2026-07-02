import { HeaderSkeleton, CardSkeleton } from "@/components/dashboard/skeletons";

export default function Loading() {
  return (
    <div>
      <HeaderSkeleton />
      <div className="space-y-4">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={2} />
      </div>
    </div>
  );
}

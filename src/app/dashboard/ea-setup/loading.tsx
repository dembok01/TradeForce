import { HeaderSkeleton, CardSkeleton } from "@/components/dashboard/skeletons";

export default function EaSetupLoading() {
  return (
    <div>
      <HeaderSkeleton hasAction />
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";

/**
 * The lazy wrapper around the 3D governor ring.
 *
 * Was `hero-scene.tsx` until the rework moved the ring out of the hero and into
 * the bento; the name described a location it no longer occupied. The dynamic
 * import with `ssr: false` matters more now than it did before — the ring sits
 * well below the fold, and three/drei must not be what first paint waits on.
 */
const GovernorScene = dynamic(
  () => import("@/components/three/governor-scene").then((m) => m.GovernorScene),
  {
    ssr: false,
    loading: () => <GovernorFallback />,
  }
);

function GovernorFallback() {
  return (
    <div
      className="h-full w-full rounded-full"
      style={{
        background: "radial-gradient(closest-side, hsl(42 62% 58% / 0.18), transparent 70%)",
      }}
      aria-hidden
    />
  );
}

export function GovernorVisual({ className }: { className?: string }) {
  return (
    <div className={className ?? "relative aspect-square w-full"}>
      <GovernorScene />
    </div>
  );
}

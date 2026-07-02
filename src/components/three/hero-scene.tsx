"use client";

import dynamic from "next/dynamic";

const GovernorScene = dynamic(
  () => import("@/components/three/governor-scene").then((m) => m.GovernorScene),
  {
    ssr: false,
    loading: () => <HeroSceneFallback />,
  }
);

function HeroSceneFallback() {
  return (
    <div
      className="h-full w-full rounded-full"
      style={{
        background:
          "radial-gradient(closest-side, hsl(42 62% 58% / 0.18), transparent 70%)",
      }}
      aria-hidden
    />
  );
}

export function HeroScene() {
  return (
    <div className="relative aspect-square w-full max-w-xl mx-auto">
      <GovernorScene />
    </div>
  );
}

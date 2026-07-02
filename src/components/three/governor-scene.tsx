"use client";

import { Suspense, useSyncExternalStore } from "react";
import { Canvas } from "@react-three/fiber";
import { Float, Environment } from "@react-three/drei";
import { GovernorRing } from "@/components/three/governor-ring";

function subscribeToReducedMotion(callback: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );
}

export function GovernorScene() {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 42 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 5, 3]} intensity={1.4} color="#f4e6c1" />
      <pointLight position={[-4, -2, -3]} intensity={0.6} color="#8a6a2f" />

      <Suspense fallback={null}>
        <Float
          speed={reducedMotion ? 0 : 1.1}
          rotationIntensity={reducedMotion ? 0 : 0.25}
          floatIntensity={reducedMotion ? 0 : 0.6}
        >
          <GovernorRing reducedMotion={reducedMotion} />
        </Float>
        <Environment preset="city" environmentIntensity={0.4} />
      </Suspense>
    </Canvas>
  );
}

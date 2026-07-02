"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const TICK_COUNT = 12;

/**
 * "The Governor" — a faceted regulator wheel, not an abstract particle field.
 * Reads as a mechanical device that enforces limits: an outer ring with spokes
 * (like a valve wheel) and twelve tick markers around its rim, one of which
 * pulses at a time to echo the rule-ledger list beside it in the hero.
 */
export function GovernorRing({ reducedMotion }: { reducedMotion: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const innerRingRef = useRef<THREE.Mesh>(null);
  const activeTickRef = useRef(0);
  const tickMeshesRef = useRef<THREE.Mesh[]>([]);
  const { viewport } = useThree();

  const spokeAngles = useMemo(
    () => Array.from({ length: 6 }, (_, i) => (i / 6) * Math.PI * 2),
    []
  );

  const tickAngles = useMemo(
    () => Array.from({ length: TICK_COUNT }, (_, i) => (i / TICK_COUNT) * Math.PI * 2),
    []
  );

  const pointer = useRef({ x: 0, y: 0 });

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    if (!reducedMotion) {
      groupRef.current.rotation.z += delta * 0.09;
      if (innerRingRef.current) {
        innerRingRef.current.rotation.z -= delta * 0.16;
      }
    }

    // Gentle parallax toward the pointer — a governor that "watches" you back.
    const targetX = (state.pointer.x * viewport.width) / 40;
    const targetY = (state.pointer.y * viewport.height) / 40;
    pointer.current.x = THREE.MathUtils.lerp(pointer.current.x, targetX, 0.03);
    pointer.current.y = THREE.MathUtils.lerp(pointer.current.y, targetY, 0.03);
    groupRef.current.rotation.y = pointer.current.x * 0.4;
    groupRef.current.rotation.x = -pointer.current.y * 0.25;

    // Sequential tick pulse — one rule "checked" at a time.
    if (!reducedMotion) {
      const active = Math.floor(state.clock.elapsedTime * 1.1) % TICK_COUNT;
      if (active !== activeTickRef.current) {
        activeTickRef.current = active;
      }
      tickMeshesRef.current.forEach((mesh, i) => {
        if (!mesh) return;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const isActive = i === activeTickRef.current;
        mat.emissiveIntensity = THREE.MathUtils.lerp(
          mat.emissiveIntensity,
          isActive ? 2.4 : 0.35,
          0.12
        );
      });
    }
  });

  return (
    <group ref={groupRef} rotation={[0.15, 0.3, 0]}>
      {/* Outer regulator ring — faceted, low-poly for a machined, not organic, feel */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.1, 0.09, 6, 48]} />
        <meshStandardMaterial
          color="#d9b65c"
          metalness={0.9}
          roughness={0.28}
          emissive="#8a6a2f"
          emissiveIntensity={0.15}
        />
      </mesh>

      {/* Inner counter-rotating ring */}
      <mesh ref={innerRingRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.35, 0.045, 6, 36]} />
        <meshStandardMaterial
          color="#8a6a2f"
          metalness={0.85}
          roughness={0.35}
          emissive="#8a6a2f"
          emissiveIntensity={0.1}
        />
      </mesh>

      {/* Hub */}
      <mesh>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color="#0a0908" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Spokes — valve-wheel geometry, ties to "regulator" reading */}
      {spokeAngles.map((angle, i) => (
        <mesh
          key={i}
          position={[Math.cos(angle) * 1.05, Math.sin(angle) * 1.05, 0]}
          rotation={[0, 0, angle + Math.PI / 2]}
        >
          <cylinderGeometry args={[0.02, 0.02, 1.7, 6]} />
          <meshStandardMaterial color="#4a4030" metalness={0.7} roughness={0.5} />
        </mesh>
      ))}

      {/* Rule ticks around the rim — one illuminates at a time */}
      {tickAngles.map((angle, i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) tickMeshesRef.current[i] = el;
          }}
          position={[Math.cos(angle) * 2.1, Math.sin(angle) * 2.1, 0]}
        >
          <boxGeometry args={[0.07, 0.07, 0.07]} />
          <meshStandardMaterial
            color="#d9b65c"
            emissive="#d9b65c"
            emissiveIntensity={0.35}
            metalness={0.8}
            roughness={0.3}
          />
        </mesh>
      ))}
    </group>
  );
}

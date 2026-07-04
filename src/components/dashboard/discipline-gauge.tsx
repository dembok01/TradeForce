"use client";

import { useEffect, useRef } from "react";
import { motion, useInView, useReducedMotion, useSpring, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

type Band = "critical" | "warning" | "good";

function bandFor(score: number): Band {
  if (score < 50) return "critical";
  if (score < 75) return "warning";
  return "good";
}

const BAND_CONFIG: Record<Band, { stroke: string; label: string }> = {
  critical: { stroke: "hsl(var(--destructive))", label: "Needs work" },
  warning: { stroke: "hsl(var(--warning))", label: "On track" },
  good: { stroke: "hsl(var(--success))", label: "Excellent" },
};

// Semicircle arc meter, hand-built in SVG (a single-value-vs-limit meter, not a
// multi-series chart, so it doesn't need a charting library). The arc draws
// from zero on first view — the CSS transition it replaced only fired on
// change, never on first paint — with the numeral counting up in sync.
export function DisciplineGauge({ score, size = 180 }: { score: number; size?: number }) {
  const band = bandFor(score);
  const { stroke, label } = BAND_CONFIG[band];

  const radius = size / 2 - 12;
  const circumference = Math.PI * radius; // half circle
  const target = Math.max(0, Math.min(100, score));
  const cx = size / 2;
  const cy = size / 2;

  const svgRef = useRef<SVGSVGElement>(null);
  const numberRef = useRef<SVGTextElement>(null);
  const reduceMotion = useReducedMotion();
  const inView = useInView(svgRef, { once: true, margin: "-40px" });
  const progress = useSpring(0, { stiffness: 60, damping: 20 });
  const dashOffset = useTransform(progress, (p) => circumference * (1 - p / 100));

  useEffect(() => {
    if (!inView) return;
    if (reduceMotion) progress.jump(target);
    else progress.set(target);
  }, [inView, reduceMotion, progress, target]);

  useEffect(() => {
    const render = (latest: number) => {
      if (numberRef.current) numberRef.current.textContent = String(Math.round(latest));
    };
    // Only subscribe — no initial render call. The server HTML shows the real
    // score, so the numeral never flashes "0" while waiting for the spring.
    return progress.on("change", render);
  }, [progress]);

  return (
    <div className="flex flex-col items-center">
      <svg ref={svgRef} width={size} height={size / 2 + 16} viewBox={`0 0 ${size} ${size / 2 + 16}`}>
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="hsl(var(--secondary))"
          strokeWidth={12}
          strokeLinecap="round"
        />
        <motion.path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke={stroke}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ strokeDashoffset: dashOffset }}
        />
        <text
          ref={numberRef}
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          className="fill-foreground font-mono-tabular"
          style={{ fontSize: size * 0.2, fontFamily: "var(--font-display)", fontWeight: 600 }}
        >
          {Math.round(score)}
        </text>
        <text
          x={cx}
          y={cy + 16}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
        >
          / 100
        </text>
      </svg>
      <span
        className={cn(
          "mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
        )}
        style={{ color: stroke }}
      >
        <span className="size-1.5 rounded-full" style={{ backgroundColor: stroke }} />
        {label}
      </span>
    </div>
  );
}

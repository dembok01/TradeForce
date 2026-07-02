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
// multi-series chart, so it doesn't need a charting library).
export function DisciplineGauge({ score, size = 180 }: { score: number; size?: number }) {
  const band = bandFor(score);
  const { stroke, label } = BAND_CONFIG[band];

  const radius = size / 2 - 12;
  const circumference = Math.PI * radius; // half circle
  const progress = Math.max(0, Math.min(100, score)) / 100;
  const dashOffset = circumference * (1 - progress);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 16} viewBox={`0 0 ${size} ${size / 2 + 16}`}>
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="hsl(var(--secondary))"
          strokeWidth={12}
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke={stroke}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
        <text
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

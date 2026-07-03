"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { BarChart3 } from "lucide-react";
import type { PnlBucket } from "@/lib/data/analytics";
import { formatSignedCurrency } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";

// Validated gain/loss pair — these mirror the --success / --destructive tokens
// (hsl 142 40% 45% / hsl 6 63% 45%). Green/red is CVD-ambiguous on its own, so
// sign is always carried by a second channel too: bar direction off the zero
// baseline and the signed value in the tooltip.
const SUCCESS = "hsl(142 40% 45%)";
const DESTRUCTIVE = "hsl(6 63% 45%)";
const GRID = "hsl(20 8% 16%)"; // --border
const AXIS = "hsl(35 10% 52%)"; // --muted-foreground

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: PnlBucket }[] }) {
  if (!active || !payload?.length) return null;
  const { label, pnl } = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-mono text-muted-foreground">{label}</p>
      <p className={`font-mono-tabular font-medium ${pnl >= 0 ? "text-success" : "text-destructive"}`}>
        {formatSignedCurrency(pnl)}
      </p>
    </div>
  );
}

// Custom bar shape: round only the data-end (the two corners away from the zero
// baseline), so a gain rounds at the top and a loss rounds at the bottom.
type BarPieceProps = { x?: number; y?: number; width?: number; height?: number; payload?: PnlBucket };

function DataEndBar({ x = 0, y = 0, width = 0, height = 0, payload }: BarPieceProps) {
  const gain = (payload?.pnl ?? 0) >= 0;
  const r = Math.max(0, Math.min(4, width / 2, height));
  const fill = gain ? SUCCESS : DESTRUCTIVE;
  const d = gain
    ? `M${x},${y + height} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} Z`
    : `M${x},${y} L${x},${y + height - r} Q${x},${y + height} ${x + r},${y + height} L${x + width - r},${y + height} Q${x + width},${y + height} ${x + width},${y + height - r} L${x + width},${y} Z`;
  return <path d={d} fill={fill} />;
}

export function PnlBarChart({ data }: { data: PnlBucket[] }) {
  const hasData = data.some((d) => d.pnl !== 0);

  if (!hasData) {
    return (
      <EmptyState title="No P/L in this period" icon={BarChart3} className="h-48 py-0">
        Logged trades with a recorded P/L will chart here.
      </EmptyState>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={192}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={{ fill: AXIS, fontSize: 11, fontFamily: "var(--font-mono)" }}
        />
        <YAxis hide />
        <Tooltip cursor={{ fill: "hsl(var(--secondary))" }} content={<ChartTooltip />} />
        <Bar
          dataKey="pnl"
          shape={<DataEndBar />}
          maxBarSize={28}
          isAnimationActive
          animationDuration={600}
          animationEasing="ease-out"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

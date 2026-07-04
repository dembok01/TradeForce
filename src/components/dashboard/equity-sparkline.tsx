"use client";

import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { Activity } from "lucide-react";
import type { EquityPoint } from "@/lib/data/equity";
import { formatCurrency } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";

// Bullion gold for the equity line (a single neutral series — not a
// gain/loss encoding), signal red strictly for violation markers.
const GOLD = "hsl(42 62% 58%)";
const DESTRUCTIVE = "hsl(6 63% 45%)";

type ChartPoint = { at: string; label: string; equity: number };

function SparkTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartPoint }[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-mono text-muted-foreground">{point.label}</p>
      <p className="font-mono-tabular font-medium text-foreground">{formatCurrency(point.equity)}</p>
    </div>
  );
}

export function EquitySparkline({
  points,
  violationTimes,
}: {
  points: EquityPoint[];
  violationTimes: string[];
}) {
  if (points.length < 2) {
    return (
      <EmptyState title="No equity history yet" icon={Activity} className="h-40 py-0">
        Your EA reports equity every minute while connected — the curve appears here.
      </EmptyState>
    );
  }

  const data: ChartPoint[] = points.map((p) => ({
    at: p.at,
    label: format(new Date(p.at), "HH:mm"),
    equity: p.equity,
  }));

  // Snap each violation to the nearest sampled bucket so the marker lands on
  // the curve rather than between points.
  const windowStart = Date.parse(data[0].at);
  const markers = violationTimes
    .map((t) => Date.parse(t))
    .filter((t) => Number.isFinite(t) && t >= windowStart)
    .map((t) => {
      let nearest = data[0];
      for (const p of data) {
        if (Math.abs(Date.parse(p.at) - t) < Math.abs(Date.parse(nearest.at) - t)) nearest = p;
      }
      return nearest.at;
    });

  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GOLD} stopOpacity={0.25} />
            <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="at" hide />
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Tooltip content={<SparkTooltip />} cursor={{ stroke: "hsl(20 8% 16%)" }} />
        {markers.map((at, i) => (
          <ReferenceLine
            key={`${at}-${i}`}
            x={at}
            stroke={DESTRUCTIVE}
            strokeDasharray="3 3"
            strokeOpacity={0.7}
          />
        ))}
        <Area
          type="monotone"
          dataKey="equity"
          stroke={GOLD}
          strokeWidth={1.5}
          fill="url(#equity-fill)"
          isAnimationActive
          animationDuration={600}
          animationEasing="ease-out"
          dot={false}
          activeDot={{ r: 3, fill: GOLD, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

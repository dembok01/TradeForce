import { getTimezoneOffset } from "date-fns-tz";
import { cn } from "@/lib/utils";

export type TimelineSession = {
  key: string;
  label: string;
  enabled: boolean;
  startUtc: number;
  endUtc: number;
};

type Segment = { left: number; width: number };

// A window in local hours can wrap past midnight after timezone shift —
// split it into up to two on-screen segments.
function segmentsFor(startUtc: number, endUtc: number, offsetHours: number): Segment[] {
  const start = (((startUtc + offsetHours) % 24) + 24) % 24;
  let span = endUtc - startUtc;
  if (span < 0) span += 24;
  const end = start + span;

  if (end <= 24) {
    return [{ left: (start / 24) * 100, width: (span / 24) * 100 }];
  }
  return [
    { left: (start / 24) * 100, width: ((24 - start) / 24) * 100 },
    { left: 0, width: ((end - 24) / 24) * 100 },
  ];
}

/**
 * The trading day as a picture: one row per window, drawn on the account's
 * local clock, with a "now" cursor. Server-rendered; AutoRefresh keeps the
 * cursor honest.
 */
export function SessionTimeline({
  sessions,
  timezone,
}: {
  sessions: TimelineSession[];
  timezone: string;
}) {
  const now = new Date();
  const offsetHours = getTimezoneOffset(timezone, now) / 3_600_000;
  const nowLocalHour =
    (((now.getUTCHours() + now.getUTCMinutes() / 60 + offsetHours) % 24) + 24) % 24;
  const nowPct = (nowLocalHour / 24) * 100;

  if (sessions.length === 0) return null;

  return (
    <div className="flex gap-3">
      <div className="flex w-28 shrink-0 flex-col justify-start pt-0.5">
        {sessions.map((s) => (
          <div
            key={s.key}
            className={cn(
              "flex h-7 items-center truncate text-xs",
              s.enabled ? "text-foreground" : "text-muted-foreground/60"
            )}
            title={s.label}
          >
            {s.label}
          </div>
        ))}
        <div className="h-5" />
      </div>

      <div className="relative min-w-0 flex-1">
        {sessions.map((s) => (
          <div key={s.key} className="relative h-7">
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/60" />
            {segmentsFor(s.startUtc, s.endUtc, offsetHours).map((seg, i) => (
              <div
                key={i}
                className={cn(
                  "absolute top-1/2 h-3 -translate-y-1/2 rounded-full",
                  s.enabled
                    ? "border border-primary/40 bg-primary/25"
                    : "border border-border bg-secondary/60"
                )}
                style={{ left: `${seg.left}%`, width: `${Math.max(seg.width, 1)}%` }}
              />
            ))}
          </div>
        ))}

        {/* now cursor */}
        <div
          className="absolute inset-y-0 w-px bg-foreground/70"
          style={{ left: `${nowPct}%` }}
          aria-hidden
        />

        <div className="mt-1 flex h-4 justify-between font-mono text-[10px] text-muted-foreground">
          {[0, 6, 12, 18, 24].map((h) => (
            <span key={h}>{String(h % 24).padStart(2, "0")}:00</span>
          ))}
        </div>
      </div>
    </div>
  );
}

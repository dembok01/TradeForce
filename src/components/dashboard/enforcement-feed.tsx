"use client";

import { useState } from "react";
import { format } from "date-fns";
import { motion } from "motion/react";
import type { FeedEvent } from "@/lib/enforcement-feed";
import { explainViolation, VIOLATION_LABELS } from "@/lib/violation-explainers";
import { formatSignedCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export type FeedRowTone = "violation" | "gain" | "loss" | "neutral";

const TONE_DOT: Record<FeedRowTone, string> = {
  violation: "bg-destructive",
  gain: "bg-success",
  loss: "bg-destructive/70",
  neutral: "bg-muted-foreground/50",
};

// Presentational row — also drives the landing page's scripted demo feed.
export function FeedRowView({
  time,
  tone,
  title,
  amount,
  flash = false,
}: {
  time: string;
  tone: FeedRowTone;
  title: string;
  amount?: string | null;
  flash?: boolean;
}) {
  return (
    <motion.li
      initial={flash ? { opacity: 0, backgroundColor: "hsl(42 62% 58% / 0.14)" } : false}
      animate={{ opacity: 1, backgroundColor: "hsl(42 62% 58% / 0)" }}
      transition={{ duration: 0.25, backgroundColor: { duration: 1.6, ease: "easeOut" } }}
      className="ledger-row flex items-baseline gap-3 py-2.5 text-sm"
    >
      <span className="shrink-0 font-mono-tabular text-xs text-muted-foreground">{time}</span>
      <span className={cn("relative top-[-1px] size-1.5 shrink-0 rounded-full", TONE_DOT[tone])} />
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          tone === "violation" ? "text-destructive" : "text-foreground"
        )}
        title={title}
      >
        {title}
      </span>
      {amount && (
        <span
          className={cn(
            "shrink-0 font-mono-tabular text-xs",
            tone === "gain" ? "text-success" : tone === "loss" ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {amount}
        </span>
      )}
    </motion.li>
  );
}

/**
 * The overview's live event stream. Rows present at mount render statically;
 * rows arriving via AutoRefresh revalidation get a one-time gold flash — the
 * moment the product proves the EA is really there.
 */
export function EnforcementFeed({ events }: { events: FeedEvent[] }) {
  const [seenIds] = useState(() => new Set(events.map((e) => e.id)));

  return (
    <ul>
      {events.map((event) => {
        const isNew = !seenIds.has(event.id);
        if (isNew) seenIds.add(event.id);
        const time = format(new Date(event.at), "HH:mm");

        if (event.kind === "violation") {
          return (
            <FeedRowView
              key={event.id}
              time={time}
              tone="violation"
              title={explainViolation(event)}
              amount={VIOLATION_LABELS[event.type]}
              flash={isNew}
            />
          );
        }

        const tone: FeedRowTone =
          event.pnl === null || event.pnl === 0 ? "neutral" : event.pnl > 0 ? "gain" : "loss";
        const verb = event.closed ? "closed" : "opened";
        return (
          <FeedRowView
            key={event.id}
            time={time}
            tone={tone}
            title={`${event.symbol} ${event.direction} ${verb}${event.source === "MANUAL" ? " (manual)" : ""}`}
            amount={event.pnl !== null ? formatSignedCurrency(event.pnl) : null}
            flash={isNew}
          />
        );
      })}
    </ul>
  );
}

"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { ShieldCheck } from "lucide-react";
import { FeedRowView, type FeedRowTone } from "@/components/dashboard/enforcement-feed";

type DemoEvent = {
  time: string;
  tone: FeedRowTone;
  title: string;
  amount?: string | null;
  // ms before the NEXT event appears
  hold: number;
};

// A scripted afternoon: five trades for +$412.80, then a sixth over the cap,
// closed on fill. The hero frame shows the same day. Reuses the dashboard's
// real feed row component, so the demo looks exactly like the thing you get.
const SCRIPT: DemoEvent[] = [
  { time: "13:02", tone: "neutral", title: "EA connected · charter v14", amount: null, hold: 1200 },
  { time: "13:18", tone: "loss", title: "XAUUSD SHORT closed", amount: "−$42.10", hold: 1100 },
  { time: "13:37", tone: "gain", title: "EURUSD LONG closed", amount: "+$86.40", hold: 1100 },
  { time: "14:05", tone: "gain", title: "GBPUSD LONG closed", amount: "+$114.75", hold: 1100 },
  { time: "14:22", tone: "gain", title: "XAUUSD LONG closed", amount: "+$168.20", hold: 1100 },
  { time: "14:41", tone: "gain", title: "US30 LONG closed", amount: "+$85.55", hold: 1400 },
  {
    time: "14:43",
    tone: "violation",
    title: "Trade #6 over your cap of 5",
    amount: "Overtrading",
    hold: 1600,
  },
  {
    time: "14:43",
    tone: "neutral",
    title: "Closed 0.4s after fill. Logged.",
    amount: null,
    hold: 6000,
  },
];

function subscribeToReducedMotion(callback: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

/**
 * The server cannot know whether a visitor prefers reduced motion, and motion's
 * own `useReducedMotion()` reports the real value on the very first client
 * render — so the server rendered 0 rows while a reduced-motion client rendered
 * all 8, and React threw a hydration mismatch on the landing page for exactly
 * the visitors least able to tolerate a full re-render.
 *
 * `useSyncExternalStore` fixes it properly: the third argument is the server
 * snapshot, which React also uses for the first hydration render, so SSR and
 * hydration agree and the real preference is applied on the pass after. This is
 * the same pattern `three/governor-scene.tsx` already uses.
 */
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );
}

function DemoFeed() {
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { margin: "-80px" });
  const reduceMotion = usePrefersReducedMotion();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (reduceMotion || !inView) return;
    const delay = count === 0 ? 400 : SCRIPT[count - 1].hold;
    const id = setTimeout(() => {
      setCount((c) => (c >= SCRIPT.length ? 1 : c + 1));
    }, delay);
    return () => clearTimeout(id);
  }, [count, inView, reduceMotion]);

  // Reduced motion: the full script rendered statically, no timers.
  const visible = SCRIPT.slice(0, reduceMotion ? SCRIPT.length : count);

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-card border border-border bg-card shadow-2xl"
    >
      <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-success" />
        </span>
        <span className="text-xs text-muted-foreground">
          Enforcement feed · demo
        </span>
      </div>
      <div className="flex h-[320px] flex-col justify-end px-5 pb-3">
        <ul>
          <AnimatePresence initial={false}>
            {visible.map((event, i) => (
              <motion.div
                key={`${event.time}-${i}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <FeedRowView
                  time={event.time}
                  tone={event.tone}
                  title={event.title}
                  amount={event.amount}
                  flash={event.tone === "violation"}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}

const POINTS = [
  "Enforced in the terminal",
  "Every close logged with its numbers",
  "Rule changes land in about a minute",
];

export function LiveDemo() {
  return (
    <section id="proof" className="border-t border-border/60 bg-obsidian py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="eyebrow">The moment that matters</p>
          <h2 className="type-h2 mt-5">Watch trade #6 get closed.</h2>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
            Five trades, up $412.80. The sixth goes in anyway. Closed on fill.
          </p>
          <ul className="mt-8 space-y-3.5 text-sm text-muted-foreground">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2} />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <DemoFeed />
      </div>
    </section>
  );
}

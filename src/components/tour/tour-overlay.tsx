"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { TOUR_STEPS } from "@/components/tour/tour-steps";
import { Button } from "@/components/ui/button";

type Rect = { x: number; y: number; width: number; height: number };

const SPOT_PADDING = 8;
const CARD_WIDTH = 360;
const CARD_EST_HEIGHT = 220;
const GAP = 14;
const MARGIN = 16;

export function TourOverlay({ onFinish, onSkip }: { onFinish: () => void; onSkip: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const step = TOUR_STEPS[index];
  const total = TOUR_STEPS.length;
  const isLast = index === total - 1;

  const measure = useCallback(() => {
    setViewport({ w: window.innerWidth, h: window.innerHeight });
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    const targetId = isDesktop ? step.targetId : (step.mobileTargetId ?? step.targetId);
    if (!targetId) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour-id="${targetId}"]`);
    if (!el) {
      // Target missing (wrong page, hidden breakpoint) — degrade to a centered card.
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({
      x: r.left - SPOT_PADDING,
      y: r.top - SPOT_PADDING,
      width: r.width + SPOT_PADDING * 2,
      height: r.height + SPOT_PADDING * 2,
    });
  }, [step]);

  // Bring the target into view, then measure after layout settles.
  useLayoutEffect(() => {
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    const targetId = isDesktop ? step.targetId : (step.mobileTargetId ?? step.targetId);
    const el = targetId ? document.querySelector(`[data-tour-id="${targetId}"]`) : null;
    el?.scrollIntoView({ block: "center", behavior: "instant" });
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [step, measure]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  const next = useCallback(() => {
    if (isLast) onFinish();
    else setIndex((i) => i + 1);
  }, [isLast, onFinish]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onSkip();
      else if (event.key === "ArrowRight") next();
      else if (event.key === "ArrowLeft") back();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onSkip, next, back]);

  useEffect(() => {
    cardRef.current?.focus();
  }, [index]);

  // Keep focus inside the card while the tour is modal.
  function trapFocus(event: React.KeyboardEvent) {
    if (event.key !== "Tab" || !cardRef.current) return;
    const focusables = cardRef.current.querySelectorAll<HTMLElement>("button");
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const spring = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 300, damping: 30 };

  const isPhone = viewport.w > 0 && viewport.w < 640;
  const cardStyle: React.CSSProperties | undefined = rect
    ? isPhone
      ? { left: MARGIN, right: MARGIN, bottom: MARGIN }
      : (() => {
          const width = Math.min(CARD_WIDTH, viewport.w - MARGIN * 2);
          let top = rect.y + rect.height + GAP;
          if (top + CARD_EST_HEIGHT > viewport.h - MARGIN) {
            top = Math.max(MARGIN, rect.y - CARD_EST_HEIGHT - GAP);
          }
          const left = Math.min(Math.max(rect.x, MARGIN), viewport.w - width - MARGIN);
          return { top, left, width };
        })()
    : undefined;

  const card = (
    <motion.div
      ref={cardRef}
      key={index}
      tabIndex={-1}
      onKeyDown={trapFocus}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="pointer-events-auto w-[min(360px,calc(100vw-32px))] rounded-xl border border-border bg-card p-5 shadow-lg outline-none"
      style={cardStyle ? { position: "fixed", ...cardStyle } : undefined}
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary/80">
        {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </p>
      <h2 className="mt-2 font-display text-lg font-semibold tracking-tight">{step.title}</h2>
      <p aria-live="polite" className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {step.body}
      </p>
      <div className="mt-5 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onSkip}>
          Skip tour
        </Button>
        <div className="flex gap-2">
          {index > 0 && (
            <Button variant="outline" size="sm" onClick={back}>
              Back
            </Button>
          )}
          <Button variant="gold" size="sm" onClick={next}>
            {isLast ? "Finish" : "Next"}
          </Button>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Dashboard tour">
      <svg className="absolute inset-0 h-full w-full">
        <defs>
          <mask id="tour-spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <motion.rect
                initial={false}
                animate={{ x: rect.x, y: rect.y, width: rect.width, height: rect.height }}
                transition={spring}
                rx={12}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <motion.rect
          width="100%"
          height="100%"
          fill="black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.72 }}
          transition={{ duration: reduceMotion ? 0 : 0.3 }}
          mask="url(#tour-spotlight-mask)"
        />
      </svg>

      {rect && (
        <motion.div
          aria-hidden
          className="border-gold-glow pointer-events-none absolute rounded-xl border border-primary/40"
          initial={false}
          animate={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
          transition={spring}
        />
      )}

      {rect ? (
        card
      ) : (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          {card}
        </div>
      )}
    </div>
  );
}

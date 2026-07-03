"use client";

import { useEffect, useRef } from "react";
import { useInView, useReducedMotion, useSpring } from "motion/react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/format";

type CountUpFormat = "number" | "currency" | "signedCurrency" | "percent";

// `format` is a string key (not a function prop) so async server pages can
// pass it across the client boundary.
const FORMATTERS: Record<CountUpFormat, (value: number) => string> = {
  number: (v) => String(Math.round(v)),
  currency: formatCurrency,
  signedCurrency: formatSignedCurrency,
  percent: (v) => formatPercent(v),
};

export function CountUp({
  value,
  format = "number",
  className,
}: {
  value: number;
  format?: CountUpFormat;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduceMotion = useReducedMotion();
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const spring = useSpring(0, { stiffness: 90, damping: 24 });

  useEffect(() => {
    if (!inView) return;
    if (reduceMotion) spring.jump(value);
    else spring.set(value);
  }, [inView, reduceMotion, spring, value]);

  useEffect(() => {
    const render = (latest: number) => {
      if (ref.current) ref.current.textContent = FORMATTERS[format](latest);
    };
    render(spring.get());
    return spring.on("change", render);
  }, [spring, format]);

  return (
    <span ref={ref} className={cn("font-mono-tabular", className)}>
      {FORMATTERS[format](reduceMotion ? value : 0)}
    </span>
  );
}

"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

function Progress({
  className,
  value,
  indicatorClassName,
  animateOnView = false,
  animationDelayMs = 0,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  indicatorClassName?: string;
  animateOnView?: boolean;
  animationDelayMs?: number;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = React.useState(!animateOnView);

  // Fill from zero once scrolled into view. The fill itself is a CSS
  // transition, so the global reduced-motion kill-switch neutralizes it.
  React.useEffect(() => {
    if (!animateOnView || revealed) return;
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { rootMargin: "-40px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [animateOnView, revealed]);

  const displayed = revealed ? (value ?? 0) : 0;

  return (
    <ProgressPrimitive.Root
      ref={rootRef}
      data-slot="progress"
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-secondary", className)}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "h-full flex-1 rounded-full bg-primary transition-transform duration-700 ease-out",
          indicatorClassName
        )}
        style={{
          transform: `translateX(-${100 - displayed}%)`,
          transitionDelay: animationDelayMs ? `${animationDelayMs}ms` : undefined,
        }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };

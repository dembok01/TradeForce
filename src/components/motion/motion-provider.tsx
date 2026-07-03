"use client";

import { MotionConfig } from "motion/react";

// The global reduced-motion CSS kill-switch in globals.css only covers CSS
// animations/transitions; motion animates via inline styles, so it needs its
// own opt-out. Mounted once in the dashboard layout.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

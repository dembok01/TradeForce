"use client";

import { motion, type Variants } from "motion/react";

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

// Staggered entrance for grids/lists. Layout classes (grid, gap, …) go on
// StaggerGroup; each child wraps in StaggerItem.
export function StaggerGroup({
  children,
  className,
  stagger = 0.06,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
  "data-tour-id"?: string;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={itemVariants} className={className}>
      {children}
    </motion.div>
  );
}

import * as React from "react";
import { cn } from "@/lib/utils";

// Token-driven placeholder block. The pulse is disabled automatically for users
// with prefers-reduced-motion (handled globally in globals.css).
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-secondary", className)}
      {...props}
    />
  );
}

export { Skeleton };

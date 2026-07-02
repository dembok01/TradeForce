"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-start py-16">
      <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.2em] text-destructive">
        Enforcement interrupted
      </p>
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        This page couldn&apos;t load.
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Something broke while reading your account. Your rules and trade history are safe —
        nothing was changed. Try again, and if it keeps happening, sign out and back in.
      </p>
      {error.digest && (
        <p className="mt-4 font-mono text-xs text-muted-foreground">Reference {error.digest}</p>
      )}
      <Button variant="gold" className="mt-6" onClick={() => unstable_retry()}>
        Try again
      </Button>
    </div>
  );
}

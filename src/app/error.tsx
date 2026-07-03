"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function RootError({
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-obsidian px-6 text-center">
      <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.2em] text-destructive">
        Something broke
      </p>
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        This page couldn&apos;t load.
      </h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Nothing on your account was changed. Try again — if it keeps happening,
        come back in a few minutes.
      </p>
      {error.digest && (
        <p className="mt-4 font-mono text-xs text-muted-foreground">Reference {error.digest}</p>
      )}
      <Button variant="gold" className="mt-6" onClick={() => unstable_retry()}>
        Try again
      </Button>
    </main>
  );
}

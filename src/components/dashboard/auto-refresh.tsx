"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Server components don't refresh themselves, but the EA reports every ~60s —
// without this, a locked account or a fresh trade only appears after a manual
// reload. router.refresh() re-runs the current route's server reads without
// touching client state; skipped while the tab is hidden.
export function AutoRefresh({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}

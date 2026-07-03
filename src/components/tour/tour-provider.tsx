"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { completeTourAction } from "@/lib/actions/tour";
import { TourOverlay } from "@/components/tour/tour-overlay";

const TourContext = createContext<{ startTour: () => void }>({ startTour: () => {} });

export function useTour() {
  return useContext(TourContext);
}

// Owns when the tour runs. Content steps live on the dashboard home, so both
// auto-start and manual relaunch route there first, then wait out the entrance
// stagger before measuring targets.
export function TourProvider({
  autoStart,
  children,
}: {
  autoStart: boolean;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState(false);
  const [pendingStart, setPendingStart] = useState(autoStart);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pendingStart || active || pathname !== "/dashboard") return;
    const timer = window.setTimeout(() => {
      setPendingStart(false);
      setActive(true);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [pendingStart, active, pathname]);

  const startTour = useCallback(() => {
    if (pathname !== "/dashboard") router.push("/dashboard");
    setPendingStart(true);
  }, [pathname, router]);

  const finish = useCallback(() => {
    setActive(false);
    // Fire-and-forget: worst case the flag doesn't stick and the tour offers
    // itself again next visit.
    void completeTourAction();
  }, []);

  return (
    <TourContext.Provider value={{ startTour }}>
      {children}
      {active && <TourOverlay onFinish={finish} onSkip={finish} />}
    </TourContext.Provider>
  );
}

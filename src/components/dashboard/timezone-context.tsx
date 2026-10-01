"use client";

import { createContext, useContext } from "react";

// The account's timezone, for client components that print times. Formatting
// with the browser's zone printed UTC on the server paint (Vercel's clock) and
// local time after hydration - a mismatch, and the wrong clock if the trader's
// configured zone isn't the browser's.
const TimezoneContext = createContext("UTC");

export function TimezoneProvider({ timezone, children }: { timezone: string; children: React.ReactNode }) {
  return <TimezoneContext value={timezone}>{children}</TimezoneContext>;
}

export const useTimezone = () => useContext(TimezoneContext);

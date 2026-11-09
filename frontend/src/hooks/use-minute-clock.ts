"use client";

import { useEffect, useState } from "react";

/**
 * Now, refreshed every minute: "in 2h 15m", "Done" and the greeting move on
 * while a phone screen stays open.
 */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

"use client";

import { useEffect, useState } from "react";

/** Current time, re-rendering every `intervalMs` so countdowns ("closes in 41m") stay honest. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

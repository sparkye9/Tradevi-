'use client';
import { useEffect, useState } from 'react';
import { marketClock, type MarketClock } from '@/lib/powerHour';

/**
 * Market clock that is only computed in the browser. Returns null on the
 * server render and the first client render so the HTML matches (the clock
 * would otherwise differ between build time and page load and trigger a
 * React hydration error).
 */
export function useMarketClock(intervalMs = 30_000): MarketClock | null {
  const [clock, setClock] = useState<MarketClock | null>(null);
  useEffect(() => {
    setClock(marketClock());
    const id = setInterval(() => setClock(marketClock()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return clock;
}

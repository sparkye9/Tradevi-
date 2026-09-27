'use client';
import { useState } from 'react';
import { Moon } from 'lucide-react';
import { useMarketClock } from '@/hooks/useMarketClock';

/** Tells students up front why numbers look stale or empty outside market hours. */
export default function MarketStatusBanner() {
  const clock = useMarketClock(60_000);
  const [dismissed, setDismissed] = useState(false);
  if (!clock || clock.cashOpen || dismissed) return null;

  const why = clock.holidayName
    ? `Today is a market holiday (${clock.holidayName}).`
    : clock.session === 'Weekend'
    ? "It's the weekend."
    : "It's outside regular trading hours.";

  return (
    <div className="bg-tv-blue/10 border-b border-tv-blue/20 px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <p className="text-xs text-gray-300 flex items-start gap-2">
          <Moon size={14} className="text-tv-blue shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold text-white">The US stock market is closed.</span> {why} Prices and scans
            show the last session, and some panels may be empty. Regular hours: weekdays 9:30 AM–4:00 PM ET.
          </span>
        </p>
        <button
          onClick={() => setDismissed(true)}
          className="text-gray-400 hover:text-white text-xs font-medium whitespace-nowrap"
        >
          OK ×
        </button>
      </div>
    </div>
  );
}

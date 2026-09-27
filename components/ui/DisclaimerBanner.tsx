'use client';
import { useState } from 'react';

export function DisclaimerBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="bg-tv-amber/10 border-b border-tv-amber/20 px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <p className="text-xs text-tv-amber/90">
          <span className="font-bold text-tv-amber">Education only — not financial advice.</span> Tradevi does not
          place trades and is not responsible for any trade you make. Futures and options can lose more than you put
          in. Always verify every setup on the charts (TradingView or your broker) before you act.
        </p>
        <button
          onClick={() => setDismissed(true)}
          className="text-tv-amber/80 hover:text-tv-amber text-xs font-medium whitespace-nowrap"
        >
          Got it ×
        </button>
      </div>
    </div>
  );
}

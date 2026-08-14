'use client';
import { useState } from 'react';

export function DisclaimerBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <p className="text-xs text-amber-200/90">
          <span className="font-bold text-amber-200">Education only.</span> Tradevi does not give financial
          advice and does not execute trades. Futures and options can lose more than you put in. Confirm every
          setup on TradingView and in your broker before you act.
        </p>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-400/80 hover:text-amber-200 text-xs font-medium whitespace-nowrap"
        >
          Got it ×
        </button>
      </div>
    </div>
  );
}

'use client';
import { useState } from 'react';

export function DisclaimerBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <p className="text-xs text-amber-800">
          <span className="font-bold">⚠️ DISCLAIMER:</span> TradeWise is for education, research, alerts, and journaling only.
          It does not provide financial advice and does not execute trades.
          Options can go to zero. Always confirm manually in Robinhood.
        </p>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-600 hover:text-amber-800 text-xs font-medium whitespace-nowrap"
        >
          Got it ×
        </button>
      </div>
    </div>
  );
}

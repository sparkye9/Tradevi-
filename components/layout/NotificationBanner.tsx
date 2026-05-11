'use client';
import { useEffect, useState } from 'react';
import { useAlertsStore } from '@/store/alertsStore';
import { getAlertStateLabel, formatTimeRemaining } from '@/lib/alerts';
import { X, AlertTriangle, TrendingUp } from 'lucide-react';
import Link from 'next/link';

export function NotificationBanner() {
  const triggered = useAlertsStore(s => s.getTriggered());
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    setVisible(triggered.length > 0);
  }, [triggered.length]);

  const activeAlerts = triggered.filter(a => !dismissed.includes(a.id));
  if (activeAlerts.length === 0) return null;

  const top = activeAlerts[0];

  return (
    <div className="bg-green-600 text-white px-4 py-2 animate-slide-in">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 w-6 h-6 bg-white/20 rounded-full flex items-center justify-center animate-pulse">
            <TrendingUp size={12} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              🚨 Trade Window Open: {top.symbol} {top.direction.toUpperCase()} ${top.strike}
            </p>
            <p className="text-xs text-green-100 truncate">
              Max entry: ${top.suggestedMaxEntry.toFixed(2)} •{' '}
              {top.tradeWindowExpiresAt ? `Window: ${formatTimeRemaining(top.tradeWindowExpiresAt)}` : `~${top.tradeWindowMinutes}min`} •
              Open your broker and review manually
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {activeAlerts.length > 1 && (
            <span className="bg-white/20 rounded-full px-2 py-0.5 text-xs">+{activeAlerts.length - 1} more</span>
          )}
          <Link href="/alerts" className="bg-white text-green-700 px-3 py-1 rounded-full text-xs font-bold hover:bg-green-50">
            Review
          </Link>
          <button onClick={() => setDismissed(d => [...d, top.id])} className="p-1 hover:bg-white/20 rounded">
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

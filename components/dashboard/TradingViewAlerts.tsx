'use client';
import { useEffect, useState } from 'react';

interface TvAlert {
  id: string;
  symbol: string;
  message: string;
  received_at: string;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch {
    return iso;
  }
}

export default function TradingViewAlerts() {
  const [alerts, setAlerts] = useState<TvAlert[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/tradingview/alerts?limit=8', { cache: 'no-store' });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? 'Alerts unavailable');
          return;
        }
        setAlerts(json.alerts ?? []);
        setError('');
      } catch {
        if (!cancelled) setError('Alerts unavailable');
      }
    }
    load();
    const id = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <span className="label">TradingView alerts</span>
      </div>
      {error ? (
        <p className="text-sm text-gray-500">{error}</p>
      ) : alerts === null ? (
        <div className="skeleton h-10 w-full" />
      ) : alerts.length === 0 ? (
        <p className="text-sm text-gray-500">
          No alerts received yet. Point a TradingView alert&apos;s webhook URL at{' '}
          <code className="text-[11px] text-gray-400">/api/tradingview/webhook</code>.
        </p>
      ) : (
        alerts.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-[#1a1a1a] last:border-0">
            <div className="min-w-0">
              <span className="font-mono font-bold text-white">{a.symbol}</span>
              {a.message && <span className="text-xs text-gray-400 ml-2 truncate">{a.message}</span>}
            </div>
            <span className="text-xs text-gray-500 font-mono shrink-0">{fmtTime(a.received_at)}</span>
          </div>
        ))
      )}
    </div>
  );
}

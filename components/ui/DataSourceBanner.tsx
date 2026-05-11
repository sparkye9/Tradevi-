'use client';
import { AlertTriangle, Clock, Wifi, WifiOff } from 'lucide-react';

export type DataSource = 'yahoo_delayed' | 'mock' | null;

interface Props {
  dataSource: DataSource;
  fetchedAt?: string | null;
  className?: string;
}

export function DataSourceBanner({ dataSource, fetchedAt, className = '' }: Props) {
  if (!dataSource) return null;

  if (dataSource === 'mock') {
    return (
      <div className={`flex items-start gap-3 p-3 bg-red-600 text-white rounded-xl ${className}`}>
        <WifiOff size={16} className="flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-sm">⚠️ DEMO DATA — Prices are NOT current market prices</p>
          <p className="text-xs text-red-100 mt-0.5">
            Yahoo Finance is unreachable from this server. All prices, options chains, and scanner results are
            estimated demo values and <strong>do not reflect actual market conditions.</strong>{' '}
            Do not use for real trading decisions. Verify all prices in your broker before entering any trade.
          </p>
        </div>
      </div>
    );
  }

  if (dataSource === 'yahoo_delayed') {
    const ago = fetchedAt
      ? Math.round((Date.now() - new Date(fetchedAt).getTime()) / 60000)
      : null;
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 ${className}`}>
        <Clock size={12} className="flex-shrink-0 text-amber-600" />
        <span>
          <strong>Yahoo Finance · ~15–20 min delayed.</strong>{' '}
          Prices may differ from your broker&apos;s real-time feed.
          {ago !== null && ago > 0 && ` Last fetched ${ago}m ago.`}{' '}
          Always confirm current bid/ask in your broker before entering any trade.
        </span>
        <span className="ml-auto flex items-center gap-1 text-green-700 font-medium whitespace-nowrap">
          <Wifi size={11} /> Live (delayed)
        </span>
      </div>
    );
  }

  return null;
}

export function DataSourceBadge({ dataSource }: { dataSource: DataSource }) {
  if (!dataSource) return null;
  if (dataSource === 'mock') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-300">
        <WifiOff size={9} /> DEMO
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
      <Clock size={9} /> 15–20min delay
    </span>
  );
}

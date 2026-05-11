'use client';
import { AlertTriangle, Clock, Zap } from 'lucide-react';

export type DataSource = 'twelve_data' | 'finnhub_realtime' | 'yahoo_delayed' | null;

interface Props {
  dataSource: DataSource;
  fetchedAt?: string | null;
  className?: string;
}

export function DataSourceBanner({ dataSource, fetchedAt, className = '' }: Props) {
  if (dataSource !== 'yahoo_delayed') return null;

  const ago = fetchedAt
    ? Math.round((Date.now() - new Date(fetchedAt).getTime()) / 60000)
    : null;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 ${className}`}
    >
      <AlertTriangle size={12} className="flex-shrink-0 text-amber-500" />
      <span>
        <strong>Delayed Data · ~15–20 min behind real-time.</strong>{' '}
        Prices may differ from your broker&apos;s live feed.
        {ago !== null && ago > 0 && ` Fetched ${ago}m ago.`}{' '}
        Always confirm current bid/ask before entering any trade.
      </span>
      <span className="ml-auto flex items-center gap-1 text-amber-600 font-medium whitespace-nowrap">
        <Clock size={11} /> Delayed
      </span>
    </div>
  );
}

export function DataSourceBadge({ dataSource }: { dataSource: DataSource }) {
  if (dataSource === 'yahoo_delayed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
        <Clock size={9} />
        Delayed Data
      </span>
    );
  }

  if (dataSource === 'twelve_data') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        <Zap size={9} />
        Live · Twelve Data
      </span>
    );
  }

  if (dataSource === 'finnhub_realtime') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
        <Zap size={9} />
        Live · Finnhub
      </span>
    );
  }

  return null;
}

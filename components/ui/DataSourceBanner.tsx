'use client';
import { Clock, Wifi } from 'lucide-react';

export type DataSource = 'yahoo_delayed' | null;

interface Props {
  dataSource: DataSource;
  fetchedAt?: string | null;
  className?: string;
}

export function DataSourceBanner({ dataSource, fetchedAt, className = '' }: Props) {
  if (dataSource !== 'yahoo_delayed') return null;
  const ago = fetchedAt ? Math.round((Date.now() - new Date(fetchedAt).getTime()) / 60000) : null;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 ${className}`}>
      <Clock size={12} className="flex-shrink-0 text-amber-600" />
      <span>
        <strong>Yahoo Finance · ~15–20 min delayed.</strong>{' '}
        Prices differ slightly from your broker&apos;s real-time feed.
        {ago !== null && ago > 0 && ` Fetched ${ago}m ago.`}{' '}
        Always confirm current bid/ask in your broker before entering any trade.
      </span>
      <span className="ml-auto flex items-center gap-1 text-green-700 font-medium whitespace-nowrap">
        <Wifi size={11} /> Live (delayed)
      </span>
    </div>
  );
}

export function DataSourceBadge({ dataSource }: { dataSource: DataSource }) {
  if (dataSource !== 'yahoo_delayed') return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
      <Clock size={9} /> 15–20 min delay
    </span>
  );
}

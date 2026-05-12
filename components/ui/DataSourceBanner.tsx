'use client';
import { AlertTriangle, Clock, Zap } from 'lucide-react';

export type DataSource = 'twelve_data' | 'finnhub_realtime' | 'yahoo_delayed' | 'stooq' | 'demo' | null;

interface Props {
  dataSource: DataSource;
  fetchedAt?: string | null;
  className?: string;
}

export function DataSourceBanner({ dataSource, fetchedAt, className = '' }: Props) {
  if (dataSource !== 'yahoo_delayed' && dataSource !== 'stooq' && dataSource !== 'demo') return null;

  const ago = fetchedAt
    ? Math.round((Date.now() - new Date(fetchedAt).getTime()) / 60000)
    : null;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 ${className}`}
    >
      <AlertTriangle size={12} className="flex-shrink-0 text-amber-500" />
      {dataSource === 'demo' ? (
        <span>
          <strong>Demo Data · No API keys configured.</strong>{' '}
          Charts show synthetic data for UI preview only. Configure API keys to see live prices.
        </span>
      ) : dataSource === 'stooq' ? (
        <span>
          <strong>EOD Data via Stooq · End-of-day prices.</strong>{' '}
          Data updates after market close. Always confirm live prices with your broker before trading.
          {ago !== null && ago > 0 && ` Fetched ${ago}m ago.`}
        </span>
      ) : (
        <span>
          <strong>Delayed Data · ~15–20 min behind real-time.</strong>{' '}
          Prices may differ from your broker&apos;s live feed.
          {ago !== null && ago > 0 && ` Fetched ${ago}m ago.`}{' '}
          Always confirm current bid/ask before entering any trade.
        </span>
      )}
      <span className="ml-auto flex items-center gap-1 text-amber-600 font-medium whitespace-nowrap">
        <Clock size={11} /> {dataSource === 'demo' ? 'Demo' : dataSource === 'stooq' ? 'EOD' : 'Delayed'}
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

  if (dataSource === 'stooq') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
        <Clock size={9} />
        EOD · Stooq
      </span>
    );
  }

  if (dataSource === 'demo') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
        Demo Data
      </span>
    );
  }

  return null;
}

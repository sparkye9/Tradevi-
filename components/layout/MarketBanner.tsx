'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, RefreshCw, Minus } from 'lucide-react';

interface TickerData {
  symbol: string;
  label: string;
  price: number;
  change: number;
  changePercent: number;
  isYield: boolean;
}

interface BannerData {
  success: boolean;
  tickers: TickerData[];
  summary: {
    message: string;
    bias: 'bullish' | 'bearish' | 'caution' | 'mixed';
    detail: string;
  };
  fetchedAt: string;
}

function fmt(price: number, isYield: boolean): string {
  if (price === 0) return '—';
  if (isYield) return `${price.toFixed(3)}%`;
  if (price >= 10000) return price.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (price >= 1000)  return price.toLocaleString('en-US', { maximumFractionDigits: 1 });
  return price.toFixed(2);
}

function fmtChange(change: number, pct: number, isYield: boolean): string {
  if (change === 0 && pct === 0) return '';
  const sign = change >= 0 ? '+' : '';
  if (isYield) return `${sign}${change.toFixed(3)} (${sign}${pct.toFixed(2)}%)`;
  return `${sign}${change.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
}

function TickerTile({ t }: { t: TickerData }) {
  const up      = t.changePercent > 0;
  const down    = t.changePercent < 0;
  const noData  = t.price === 0;

  const bg    = noData ? 'bg-gray-100' : up ? 'bg-green-600' : down ? 'bg-red-600' : 'bg-gray-500';
  const text  = noData ? 'text-gray-400' : 'text-white';
  const arrow = up ? <TrendingUp size={10} className="inline mb-0.5" /> : down ? <TrendingDown size={10} className="inline mb-0.5" /> : <Minus size={10} className="inline mb-0.5" />;

  return (
    <div className={`flex-shrink-0 flex flex-col items-start px-3 py-1.5 rounded-lg min-w-[100px] ${bg} ${text}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{t.label}</span>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className="text-sm font-bold tabular-nums">{fmt(t.price, t.isYield)}</span>
      </div>
      {!noData && (
        <span className="text-[10px] font-medium opacity-90 tabular-nums whitespace-nowrap">
          {arrow} {fmtChange(t.change, t.changePercent, t.isYield)}
        </span>
      )}
    </div>
  );
}

export function MarketBanner() {
  const [data,    setData]    = useState<BannerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/market-banner');
      const json = await res.json();
      if (json.success) {
        setData(json);
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 90_000); // refresh every 90s
    return () => clearInterval(id);
  }, [load]);

  // Don't render anything until first load
  if (loading && !data) {
    return (
      <div className="w-full bg-gray-900 px-3 py-2 flex items-center gap-2 text-xs text-gray-500">
        <RefreshCw size={11} className="animate-spin" />
        <span>Loading market data…</span>
      </div>
    );
  }

  if (error && !data) return null;

  const bias    = data?.summary?.bias ?? 'mixed';
  const tickers = data?.tickers ?? [];

  const summaryBg =
    bias === 'bullish' ? 'bg-green-700 text-white' :
    bias === 'caution' ? 'bg-red-700 text-white' :
                         'bg-gray-700 text-white';

  const SummaryIcon =
    bias === 'bullish' ? TrendingUp :
    bias === 'caution' ? AlertTriangle :
    bias === 'bearish' ? TrendingDown : Minus;

  return (
    <div className="w-full bg-gray-900 border-b border-gray-800 flex flex-col sm:flex-row items-stretch overflow-hidden">
      {/* Ticker tiles */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 overflow-x-auto scrollbar-none flex-1 min-w-0">
        {tickers.map(t => (
          <TickerTile key={t.symbol} t={t} />
        ))}
        {data?.fetchedAt && (
          <span className="text-[10px] text-gray-600 ml-2 shrink-0 tabular-nums whitespace-nowrap">
            {new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* Day bias summary */}
      {data?.summary && (
        <div className={`flex items-start gap-1.5 px-3 py-2 shrink-0 max-w-full sm:max-w-xs lg:max-w-sm ${summaryBg}`}>
          <SummaryIcon size={13} className="mt-0.5 shrink-0 opacity-90" />
          <p className="text-[11px] font-medium leading-tight">
            {data.summary.message}
            {data.summary.detail && (
              <span className="opacity-80">{data.summary.detail}</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

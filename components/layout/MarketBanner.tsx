'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';

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

const G = '#00ff88';
const R = '#ff3b3b';
const A = '#f59e0b';

function fmt(price: number, isYield: boolean): string {
  if (price === 0) return '—';
  if (isYield) return `${price.toFixed(3)}%`;
  if (price >= 10000) return price.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (price >= 1000)  return price.toLocaleString('en-US', { maximumFractionDigits: 1 });
  return price.toFixed(2);
}

function TickerTile({ t }: { t: TickerData }) {
  const up   = t.changePercent > 0;
  const down = t.changePercent < 0;
  const col  = up ? G : down ? R : '#6b7280';

  return (
    <div
      className="flex-shrink-0 flex flex-col items-start px-3 py-2 rounded-lg min-w-[90px]"
      style={{
        background: up ? 'rgba(0,255,136,0.06)' : down ? 'rgba(255,59,59,0.06)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${col}33`,
      }}
    >
      <span style={{ color: '#6b7280', fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {t.label}
      </span>
      <span style={{ color: '#f0f0f0', fontSize: '13px', fontWeight: 800, fontFamily: '"JetBrains Mono", monospace', lineHeight: 1.2 }}>
        {fmt(t.price, t.isYield)}
      </span>
      <span style={{ color: col, fontSize: '9px', fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}>
        {t.changePercent >= 0 ? '+' : ''}{t.changePercent.toFixed(2)}%
      </span>
    </div>
  );
}

export function MarketBanner() {
  const [data,    setData]    = useState<BannerData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/market-banner');
      const json = await res.json();
      if (json.success) setData(json);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading && !data) {
    return (
      <div
        className="w-full flex items-center gap-2 px-4 py-2"
        style={{ background: '#111318', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="h-8 w-full max-w-2xl rounded animate-pulse" style={{ background: '#1a1d26' }} />
      </div>
    );
  }

  if (!data) return null;

  const bias    = data.summary?.bias ?? 'mixed';
  const tickers = data.tickers ?? [];

  const biasColor =
    bias === 'bullish' ? G :
    bias === 'bearish' ? R :
    bias === 'caution' ? R : A;

  const BiasIcon =
    bias === 'bullish' ? TrendingUp :
    bias === 'bearish' ? TrendingDown :
    bias === 'caution' ? AlertTriangle : Minus;

  return (
    <div
      className="w-full flex flex-col sm:flex-row items-stretch shrink-0 overflow-hidden"
      style={{ background: '#0d1117', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Tickers */}
      <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto scrollbar-none flex-1 min-w-0">
        {tickers.map(t => <TickerTile key={t.symbol} t={t} />)}
        {data.fetchedAt && (
          <span className="ml-2 shrink-0 font-mono tabular-nums" style={{ color: '#374151', fontSize: '9px' }}>
            {new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* Bias summary */}
      {data.summary && (
        <div
          className="flex items-start gap-2 px-4 py-2 shrink-0 max-w-full sm:max-w-xs"
          style={{
            background: `${biasColor}0d`,
            borderLeft: `2px solid ${biasColor}40`,
          }}
        >
          <BiasIcon size={12} style={{ color: biasColor, marginTop: 2, flexShrink: 0 }} />
          <p style={{ color: '#9ca3af', fontSize: '10px', lineHeight: 1.4 }}>
            <span style={{ color: biasColor, fontWeight: 700 }}>{data.summary.message} </span>
            {data.summary.detail}
          </p>
        </div>
      )}
    </div>
  );
}

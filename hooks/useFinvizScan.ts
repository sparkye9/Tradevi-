'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTradeviStore, MARKET_TICKERS } from '@/store/tradeviStore';
import { stockQuality } from '@/lib/stockQuality';
import type { FinvizQuote, FinvizResult } from '@/lib/finviz';

export function useFinvizScan(fixedTickers?: string[]) {
  const { watchlist, rvolThreshold, setRvolThreshold, scanMode, setScanMode } = useTradeviStore();
  const tickers = fixedTickers ?? (scanMode === 'market' ? MARKET_TICKERS : watchlist);
  const tickerKey = tickers.join(',');
  const [data, setData] = useState<FinvizResult<FinvizQuote> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finviz/screener?tickers=${tickerKey}`);
      const json = await res.json();
      setData(json);
    } catch {
      setData({ data: [], sourceError: 'Fetch failed', lastUpdated: new Date().toISOString() });
    }
    setLoading(false);
  }, [tickerKey]);

  useEffect(() => {
    load();
  }, [load]);

  const withQuality = useMemo(() => {
    const quotes = data?.data ?? [];
    return quotes
      .map((q) => ({ q, quality: stockQuality(q, rvolThreshold) }))
      .sort((a, b) => b.quality.score - a.quality.score || (b.q.rvol ?? 0) - (a.q.rvol ?? 0));
  }, [data, rvolThreshold]);

  const looks = withQuality.filter((row) => row.quality.label === 'LOOK');
  const noTrades = withQuality.filter((row) => row.quality.label === 'NO_TRADE');

  return {
    data,
    loading,
    load,
    tickers,
    watchlist,
    rvolThreshold,
    setRvolThreshold,
    scanMode,
    setScanMode,
    withQuality,
    looks,
    noTrades,
  };
}

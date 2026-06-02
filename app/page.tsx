'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import SourceTag from '@/components/ui/SourceTag';
import ConsistencyGuardrail from '@/components/guardrail/ConsistencyGuardrail';
import DataUnavailable from '@/components/ui/DataUnavailable';
import type { FinvizQuote, FinvizFuture, FinvizResult } from '@/lib/finviz';
import { useTradeviStore } from '@/store/tradeviStore';

const INDEX_TICKERS = ['SPY', 'QQQ', 'IWM', 'DIA'];

interface ScreenerResult extends FinvizResult<FinvizQuote> {}
interface FuturesResult extends FinvizResult<FinvizFuture> {}

function deriveMarketPosture(quotes: FinvizQuote[]): {
  posture: 'Risk-On' | 'Risk-Off' | 'Mixed';
  conditions: string[];
} {
  const aboveSma20 = quotes.filter((q) => q.sma20rel === 'above').length;
  const strongGroup = quotes.filter((q) => q.groupStrength === 'strong').length;
  const conditions: string[] = [];

  conditions.push(`${aboveSma20} of ${quotes.length} above SMA 20`);
  conditions.push(`${strongGroup} of ${quotes.length} with strong group`);

  if (aboveSma20 >= Math.ceil(quotes.length * 0.75)) {
    return { posture: 'Risk-On', conditions };
  }
  if (aboveSma20 <= Math.floor(quotes.length * 0.25)) {
    return { posture: 'Risk-Off', conditions };
  }
  return { posture: 'Mixed', conditions };
}

function autoCount(q: FinvizQuote, threshold: number): number {
  let n = 0;
  if (q.rvol !== null && q.rvol >= threshold) n++;
  if (q.unusualVolume) n++;
  if (q.newHighDay) n++;
  if (q.sma50rel === 'above') n++;
  if (q.sma200rel === 'above') n++;
  return n;
}

export default function DashboardPage() {
  const { watchlist, rvolThreshold } = useTradeviStore();
  const [indexData, setIndexData] = useState<ScreenerResult | null>(null);
  const [watchlistData, setWatchlistData] = useState<ScreenerResult | null>(null);
  const [futuresData, setFuturesData] = useState<FuturesResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [idxRes, wlRes, futRes] = await Promise.allSettled([
        fetch(`/api/finviz/screener?tickers=${INDEX_TICKERS.join(',')}`).then((r) => r.json()),
        fetch(`/api/finviz/screener?tickers=${watchlist.join(',')}`).then((r) => r.json()),
        fetch('/api/finviz/futures').then((r) => r.json()),
      ]);
      if (idxRes.status === 'fulfilled') setIndexData(idxRes.value);
      if (wlRes.status === 'fulfilled') setWatchlistData(wlRes.value);
      if (futRes.status === 'fulfilled') setFuturesData(futRes.value);
      setLoading(false);
    }
    load();
  }, [watchlist]);

  const indexQuotes = indexData?.data ?? [];
  const wlQuotes = watchlistData?.data ?? [];
  const futures = futuresData?.data ?? [];

  const posture = indexQuotes.length > 0 ? deriveMarketPosture(indexQuotes) : null;

  const swingCandidates = [...wlQuotes]
    .filter((q) => q.sma50rel === 'above' && q.sma200rel === 'above')
    .sort((a, b) => autoCount(b, rvolThreshold) - autoCount(a, rvolThreshold))
    .slice(0, 3);

  const intradayCandidates = [...wlQuotes]
    .filter((q) => (q.rvol ?? 0) > rvolThreshold || q.newHighDay)
    .sort((a, b) => (b.rvol ?? 0) - (a.rvol ?? 0))
    .slice(0, 3);

  const esFuture = futures.find((f) => f.symbol === 'ES');
  const nqFuture = futures.find((f) => f.symbol === 'NQ');

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5">What should I focus on right now?</p>
      </div>

      {loading && <div className="text-gray-500 text-sm">Loading market data...</div>}

      {/* Market posture */}
      <section className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold text-sm">Market Posture</h2>
          {indexData && (
            <SourceTag source="Finviz Elite" lastUpdated={indexData.lastUpdated} />
          )}
        </div>

        {indexData?.sourceError ? (
          <DataUnavailable reason={indexData.sourceError} />
        ) : posture ? (
          <div>
            <div className={`text-lg font-bold mb-2 ${
              posture.posture === 'Risk-On' ? 'text-green-400' :
              posture.posture === 'Risk-Off' ? 'text-red-400' : 'text-yellow-400'
            }`}>
              {posture.posture}
            </div>
            <div className="space-y-1">
              {posture.conditions.map((c) => (
                <div key={c} className="text-sm text-gray-400">{c}</div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-gray-500 text-sm">No index data</div>
        )}
      </section>

      {/* Futures bias */}
      <section className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold text-sm">Futures Bias</h2>
          {futuresData && (
            <SourceTag source="Finviz" lastUpdated={futuresData.lastUpdated} />
          )}
        </div>
        {futuresData?.sourceError ? (
          <DataUnavailable reason={futuresData.sourceError} />
        ) : (
          <div className="flex gap-4 flex-wrap">
            {[esFuture, nqFuture].filter(Boolean).map((f) => f && (
              <div key={f.symbol} className="flex items-center gap-2">
                <span className="text-gray-400 font-mono text-sm">{f.symbol}</span>
                <span className={`font-mono text-sm ${
                  f.direction === 'up' ? 'text-green-400' :
                  f.direction === 'down' ? 'text-red-400' : 'text-gray-400'
                }`}>
                  {f.direction === 'up' ? '▲' : f.direction === 'down' ? '▼' : '--'}
                  {f.changePercent !== null ? ` ${f.changePercent.toFixed(2)}%` : ''}
                </span>
              </div>
            ))}
            {!esFuture && !nqFuture && (
              <span className="text-gray-500 text-sm">Futures data not available</span>
            )}
          </div>
        )}
      </section>

      {/* Top candidates */}
      <div className="grid grid-cols-2 gap-4">
        <section className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold text-sm">Top Swing</h2>
            <Link href="/swing" className="text-xs text-blue-400 hover:underline">View all</Link>
          </div>
          {watchlistData?.sourceError ? (
            <DataUnavailable reason={watchlistData.sourceError} />
          ) : swingCandidates.length === 0 ? (
            <div className="text-gray-500 text-sm">No swing candidates</div>
          ) : (
            <div className="space-y-2">
              {swingCandidates.map((q) => (
                <div key={q.symbol} className="flex justify-between text-sm">
                  <span className="text-white font-mono">{q.symbol}</span>
                  <span className="text-gray-400">
                    {q.price !== null ? `$${q.price.toFixed(2)}` : '--'}
                  </span>
                  <span className={q.changePercent !== null && q.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {q.changePercent !== null ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%` : '--'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold text-sm">Top Intraday</h2>
            <Link href="/trade-discovery" className="text-xs text-blue-400 hover:underline">View all</Link>
          </div>
          {watchlistData?.sourceError ? (
            <DataUnavailable reason={watchlistData.sourceError} />
          ) : intradayCandidates.length === 0 ? (
            <div className="text-gray-500 text-sm">No intraday candidates</div>
          ) : (
            <div className="space-y-2">
              {intradayCandidates.map((q) => (
                <div key={q.symbol} className="flex justify-between text-sm">
                  <span className="text-white font-mono">{q.symbol}</span>
                  <span className="text-gray-400 text-xs">
                    RVOL {q.rvol !== null ? q.rvol.toFixed(2) : '--'}
                  </span>
                  <span className={q.changePercent !== null && q.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {q.changePercent !== null ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%` : '--'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Consistency guardrail */}
      <ConsistencyGuardrail />
    </div>
  );
}

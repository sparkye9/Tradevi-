'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import TradingViewButton from '@/components/ui/TradingViewButton';
import type { FinvizQuote, FinvizFuture, FinvizResult } from '@/lib/finviz';
import { useTradeviStore } from '@/store/tradeviStore';

const INDEX_TICKERS = ['SPY', 'QQQ', 'IWM', 'GLD'];

interface ScreenerResult extends FinvizResult<FinvizQuote> {}
interface FuturesResult extends FinvizResult<FinvizFuture> {}

function deriveMarketPosture(quotes: FinvizQuote[]): {
  posture: 'Risk-On' | 'Risk-Off' | 'Mixed';
  icon: string;
  conditions: string[];
} {
  const aboveSma20 = quotes.filter((q) => q.sma20rel === 'above').length;
  const strongGroup = quotes.filter((q) => q.groupStrength === 'strong').length;
  const conditions: string[] = [];
  conditions.push(`${aboveSma20} of ${quotes.length} above SMA 20`);
  conditions.push(`${strongGroup} of ${quotes.length} with strong group`);

  if (aboveSma20 >= Math.ceil(quotes.length * 0.75)) {
    return { posture: 'Risk-On', icon: '▲', conditions };
  }
  if (aboveSma20 <= Math.floor(quotes.length * 0.25)) {
    return { posture: 'Risk-Off', icon: '▼', conditions };
  }
  return { posture: 'Mixed', icon: '◆', conditions };
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

function SmaArrow({ rel }: { rel: 'above' | 'below' | null }) {
  if (rel === 'above') return <span className="text-emerald-400">▲</span>;
  if (rel === 'below') return <span className="text-red-400">▼</span>;
  return <span className="text-gray-600">?</span>;
}

function CandidateCard({ q, rvolThreshold }: { q: FinvizQuote; rvolThreshold: number }) {
  const chgColor = (q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400';
  const isUnusual = q.unusualVolume === true && (q.rvol ?? 0) >= 2;
  const isNewHigh = q.newHighDay === true;
  return (
    <div className="card card-hover flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-white font-mono font-bold text-lg">{q.symbol}</span>
        <div className="flex gap-1.5 flex-wrap justify-end">
          {isUnusual && (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              RVOL {q.rvol!.toFixed(2)}
            </span>
          )}
          {isNewHigh && (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              NEW HIGH
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-white font-mono font-semibold text-base">
          {q.price !== null ? `$${q.price.toFixed(2)}` : '--'}
        </span>
        <span className={`font-mono font-semibold text-sm ${chgColor}`}>
          {q.changePercent !== null ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%` : '--'}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs font-mono">
        <span className="text-gray-500">SMA50 <SmaArrow rel={q.sma50rel} /></span>
        <span className="text-gray-500">SMA200 <SmaArrow rel={q.sma200rel} /></span>
        {!isUnusual && q.rvol !== null && (
          <span className="text-gray-600">RVOL {q.rvol.toFixed(2)}</span>
        )}
      </div>
      <div className="flex items-center justify-between mt-1">
        <TradingViewButton symbol={q.symbol} label="View Setup" />
      </div>
    </div>
  );
}

function IndexStatCard({ q, sym }: { q: FinvizQuote | undefined; sym: string }) {
  if (!q) {
    return (
      <div className="card flex flex-col gap-1">
        <span className="label">{sym}</span>
        <span className="value text-2xl">--</span>
      </div>
    );
  }
  const chgColor = (q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400';
  return (
    <div className="card card-hover flex flex-col gap-1">
      <span className="label">{q.symbol}</span>
      <span className="value text-2xl">{q.price !== null ? `$${q.price.toFixed(2)}` : '--'}</span>
      <span className={`font-mono font-semibold text-sm ${chgColor}`}>
        {q.changePercent !== null ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%` : '--'}
      </span>
    </div>
  );
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

  const spy = indexQuotes.find((q) => q.symbol === 'SPY');
  const qqq = indexQuotes.find((q) => q.symbol === 'QQQ');
  const iwm = indexQuotes.find((q) => q.symbol === 'IWM');
  const gld = indexQuotes.find((q) => q.symbol === 'GLD');

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

  const postureColor =
    posture?.posture === 'Risk-On' ? 'text-emerald-400' :
    posture?.posture === 'Risk-Off' ? 'text-red-400' : 'text-amber-400';
  const postureBorder =
    posture?.posture === 'Risk-On' ? 'border-emerald-500/20' :
    posture?.posture === 'Risk-Off' ? 'border-red-500/20' : 'border-amber-500/20';

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">What should I focus on right now?</p>
      </div>

      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0,1,2,3].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-3 w-12 bg-[#222] rounded mb-3" />
              <div className="h-7 w-24 bg-[#222] rounded mb-2" />
              <div className="h-4 w-16 bg-[#222] rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Index stat grid */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <IndexStatCard q={spy} sym="SPY" />
          <IndexStatCard q={qqq} sym="QQQ" />
          <IndexStatCard q={iwm} sym="IWM" />
          <IndexStatCard q={gld} sym="GLD" />
        </div>
      )}

      {/* Market posture + Futures row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Market posture */}
        <div className={`card border ${postureBorder}`}>
          <div className="flex items-center justify-between mb-3">
            <span className="label">Market Posture</span>
            {indexData && (
              <SourceTag source={indexData.source ?? 'Yahoo Finance'} lastUpdated={indexData.lastUpdated} />
            )}
          </div>
          {indexData?.sourceError ? (
            <DataUnavailable reason={indexData.sourceError} />
          ) : posture ? (
            <div>
              <div className={`text-xl font-bold font-mono mb-2 flex items-center gap-2 ${postureColor}`}>
                <span>{posture.icon}</span>
                <span>{posture.posture}</span>
              </div>
              <div className="space-y-1">
                {posture.conditions.map((c) => (
                  <div key={c} className="text-xs text-gray-500">{c}</div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-gray-600 text-sm">Verifying data...</div>
          )}
        </div>

        {/* Futures bias */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <span className="label">Futures Bias</span>
            {futuresData && (
              <SourceTag source={futuresData.source ?? 'Finviz'} lastUpdated={futuresData.lastUpdated} />
            )}
          </div>
          {futuresData?.sourceError ? (
            <DataUnavailable reason={futuresData.sourceError} />
          ) : (
            <div className="flex gap-4 flex-wrap">
              {[esFuture, nqFuture].map((f) => f ? (
                <div key={f.symbol} className="flex items-center gap-2">
                  <span className="text-gray-500 font-mono text-sm">{f.symbol}</span>
                  <span className={`font-mono font-semibold text-base ${
                    f.direction === 'up' ? 'text-emerald-400' :
                    f.direction === 'down' ? 'text-red-400' : 'text-gray-500'
                  }`}>
                    {f.direction === 'up' ? '▲' : f.direction === 'down' ? '▼' : '--'}
                    {f.changePercent !== null ? ` ${f.changePercent >= 0 ? '+' : ''}${f.changePercent.toFixed(2)}%` : ''}
                  </span>
                </div>
              ) : null)}
              {!esFuture && !nqFuture && (
                <span className="text-gray-600 text-sm">Verifying data...</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Candidate columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="label">Top Swing Candidates</span>
            <Link href="/swing" className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors">View all →</Link>
          </div>
          {watchlistData?.sourceError ? (
            <DataUnavailable reason={watchlistData.sourceError} />
          ) : swingCandidates.length === 0 ? (
            <div className="card text-gray-600 text-sm">No swing candidates</div>
          ) : (
            <div className="space-y-2">
              {swingCandidates.map((q) => (
                <CandidateCard key={q.symbol} q={q} rvolThreshold={rvolThreshold} />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="label">Top Intraday Candidates</span>
            <Link href="/intraday" className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors">View all →</Link>
          </div>
          {watchlistData?.sourceError ? (
            <DataUnavailable reason={watchlistData.sourceError} />
          ) : intradayCandidates.length === 0 ? (
            <div className="card text-gray-600 text-sm">No intraday candidates</div>
          ) : (
            <div className="space-y-2">
              {intradayCandidates.map((q) => (
                <CandidateCard key={q.symbol} q={q} rvolThreshold={rvolThreshold} />
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-700 text-center pt-2">
        Structure confirmed on TradingView only — CHOCH, BOS, FVG, VWAP not computed here.
      </p>
    </div>
  );
}

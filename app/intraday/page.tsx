'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import TradingViewButton from '@/components/ui/TradingViewButton';
import { useTradeviStore, MARKET_TICKERS } from '@/store/tradeviStore';
import type { FinvizQuote, FinvizResult } from '@/lib/finviz';

function SmaLabel({ q }: { q: FinvizQuote }) {
  const fmt = (rel: 'above' | 'below' | null, label: string) => {
    if (rel === 'above') return <span key={label} className="text-emerald-400">{label}▲</span>;
    if (rel === 'below') return <span key={label} className="text-red-400">{label}▼</span>;
    return <span key={label} className="text-gray-600">{label}?</span>;
  };
  return (
    <div className="flex gap-1 text-xs font-mono">
      {fmt(q.sma20rel, '20')}
      {fmt(q.sma50rel, '50')}
      {fmt(q.sma200rel, '200')}
    </div>
  );
}

function CandidateCard({ q, rvolThreshold }: { q: FinvizQuote; rvolThreshold: number }) {
  const isUnusual = (q.rvol ?? 0) >= 2;
  const borderClass = isUnusual ? 'border-amber-500/40 hover:border-amber-500/60' : 'border-[#1e1e1e] hover:border-[#2a2a2a]';
  return (
    <div className={`bg-[#111111] border ${borderClass} rounded-2xl p-4 flex flex-col gap-3 hover:bg-[#161616] transition-all`}>
      <div className="flex items-start justify-between">
        <div>
          <span className="text-white font-bold font-mono text-2xl">{q.symbol}</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-white font-mono font-semibold">
              {q.price !== null ? `$${q.price.toFixed(2)}` : '--'}
            </span>
            <span className={`font-mono font-semibold ${(q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {q.changePercent !== null ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%` : '--'}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isUnusual && (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              🔥 RVOL {q.rvol!.toFixed(2)}
            </span>
          )}
          {!isUnusual && q.rvol !== null && (
            <span className={`text-xs font-mono ${(q.rvol ?? 0) >= rvolThreshold ? 'text-amber-400' : 'text-gray-500'}`}>
              RVOL {q.rvol.toFixed(2)}
            </span>
          )}
          {q.newHighDay && (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              NEW HIGH
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <SmaLabel q={q} />
        <div className="flex items-center gap-2">
          {q.gap !== null && Math.abs(q.gap) > 0.5 && (
            <span className={`text-xs font-mono ${q.gap > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              Gap {q.gap > 0 ? '+' : ''}{q.gap.toFixed(2)}%
            </span>
          )}
          <span className={`text-xs ${
            q.groupStrength === 'strong' ? 'text-emerald-400' :
            q.groupStrength === 'weak' ? 'text-red-400' : 'text-gray-600'
          }`}>
            {q.groupStrength ?? ''}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-[#1e1e1e]">
        <span className="text-xs text-gray-600">Structure confirmed on TradingView</span>
        <TradingViewButton symbol={q.symbol} label="Chart" />
      </div>
    </div>
  );
}

export default function IntradayPage() {
  const { watchlist, rvolThreshold, setRvolThreshold, scanMode, setScanMode } = useTradeviStore();
  const [data, setData] = useState<FinvizResult<FinvizQuote> | null>(null);
  const [loading, setLoading] = useState(true);

  const tickers = scanMode === 'market' ? MARKET_TICKERS : watchlist;

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/finviz/screener?tickers=${tickers.join(',')}`);
      const json = await res.json();
      setData(json);
    } catch {
      setData({ data: [], sourceError: 'Fetch failed', lastUpdated: new Date().toISOString() });
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [scanMode, watchlist]); // eslint-disable-line

  const allQuotes = data?.data ?? [];

  // Intraday: RVOL above threshold OR new high of day, sorted by RVOL desc
  const intraday = [...allQuotes]
    .filter((q) => (q.rvol ?? 0) >= rvolThreshold || q.newHighDay)
    .sort((a, b) => (b.rvol ?? 0) - (a.rvol ?? 0));

  const unusual = intraday.filter((q) => (q.rvol ?? 0) >= 2);
  const regular = intraday.filter((q) => (q.rvol ?? 0) < 2 || !q.unusualVolume);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Intraday</h1>
        <p className="text-sm text-gray-500 mt-1">What is moving with conviction right now?</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl overflow-hidden border border-[#2a2a2a]">
          <button
            onClick={() => setScanMode('watchlist')}
            className={`px-4 py-2 text-xs font-semibold transition-colors ${
              scanMode === 'watchlist' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-[#111] text-gray-500 hover:text-gray-300'
            }`}
          >
            Watchlist ({watchlist.length})
          </button>
          <button
            onClick={() => setScanMode('market')}
            className={`px-4 py-2 text-xs font-semibold transition-colors ${
              scanMode === 'market' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-[#111] text-gray-500 hover:text-gray-300'
            }`}
          >
            Market Scan ({MARKET_TICKERS.length})
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500 uppercase tracking-wider font-semibold">RVOL &ge;</span>
          <input
            type="number"
            value={rvolThreshold}
            step={0.1} min={0.5} max={10}
            onChange={(e) => setRvolThreshold(parseFloat(e.target.value) || 1.5)}
            className="w-16 bg-[#111] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-emerald-500/50"
          />
        </div>

        <button
          onClick={load}
          disabled={loading}
          className="px-4 py-2 text-xs font-semibold bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl text-gray-300 hover:border-emerald-500/30 hover:text-white transition-all disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>

        <div className="ml-auto flex items-center gap-3">
          {data && <SourceTag source={data.source ?? 'Loading...'} lastUpdated={data.lastUpdated} />}
        </div>
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      {/* Unusual Volume — top priority */}
      {unusual.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-amber-400 font-bold text-sm uppercase tracking-widest">🔥 Unusual Volume</h2>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {unusual.length}
            </span>
            <span className="text-xs text-gray-600">RVOL 2x+ average — strong conviction</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {unusual.map((q) => <CandidateCard key={q.symbol} q={q} rvolThreshold={rvolThreshold} />)}
          </div>
        </section>
      )}

      {/* All intraday candidates */}
      {regular.length > 0 && (
        <section>
          <h2 className="label mb-4">All Intraday Candidates ({regular.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {regular.map((q) => <CandidateCard key={q.symbol} q={q} rvolThreshold={rvolThreshold} />)}
          </div>
        </section>
      )}

      {!loading && intraday.length === 0 && !data?.sourceError && (
        <div className="text-center py-12 text-gray-600">
          No intraday candidates at current RVOL threshold. Try lowering the threshold or switching to Market Scan.
        </div>
      )}

      <p className="text-xs text-gray-700">
        Opening range, VWAP, and structure confirmed live on TradingView — not computed here.
      </p>
    </div>
  );
}

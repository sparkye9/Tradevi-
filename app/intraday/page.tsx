'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import TradingViewButton from '@/components/ui/TradingViewButton';
import OptionsPanel from '@/components/options/OptionsPanel';
import { useTradeviStore, MARKET_TICKERS } from '@/store/tradeviStore';
import { computeOpportunityScore } from '@/lib/opportunityScore';
import { volumeLabel, trendLabel, sectorLabel } from '@/lib/labels';
import type { FinvizQuote, FinvizResult } from '@/lib/finviz';

// ─── Candidate card ───────────────────────────────────────────────────────────

function CandidateCard({ q, rvolThreshold }: { q: FinvizQuote; rvolThreshold: number }) {
  const { experienceMode } = useTradeviStore();
  const [showOptions, setShowOptions] = useState(true);
  const isUnusual = (q.rvol ?? 0) >= 2;
  const score = computeOpportunityScore(q, rvolThreshold);
  const scoreColor = score >= 75 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-gray-500';
  const borderClass = isUnusual
    ? 'border-amber-500/40 hover:border-amber-500/70'
    : 'border-[#1e1e1e] hover:border-[#2a2a2a]';

  return (
    <div className={`bg-[#111111] border ${borderClass} rounded-2xl p-4 flex flex-col gap-3 transition-all`}>
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div>
          <span className="text-white font-bold font-mono text-2xl">{q.symbol}</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-white font-mono font-semibold">
              {q.price !== null ? `$${q.price.toFixed(2)}` : '--'}
            </span>
            <span className={`font-mono font-semibold ${(q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {q.changePercent !== null
                ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%`
                : '--'}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          {isUnusual ? (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {volumeLabel(q, experienceMode)}
            </span>
          ) : (
            q.rvol !== null && (
              <span className={`text-xs font-mono ${(q.rvol ?? 0) >= rvolThreshold ? 'text-amber-400' : 'text-gray-500'}`}>
                {volumeLabel(q, experienceMode)}
              </span>
            )
          )}
          {q.newHighDay && (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              NEW HIGH
            </span>
          )}
          <span className={`text-xs font-bold font-mono ${scoreColor}`}>Score {score}</span>
        </div>
      </div>

      {/* Trend + gap + sector */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-mono ${q.sma50rel === 'above' ? 'text-emerald-400' : q.sma50rel === 'below' ? 'text-red-400' : 'text-gray-600'}`}>
          {trendLabel(q, experienceMode)}
        </span>
        <div className="flex items-center gap-2">
          {q.gap !== null && Math.abs(q.gap) > 0.5 && (
            <span className={`text-xs font-mono ${q.gap > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              Gap {q.gap > 0 ? '+' : ''}{q.gap.toFixed(2)}%
            </span>
          )}
          {sectorLabel(q, experienceMode) && (
            <span className={`text-xs font-semibold ${q.groupStrength === 'strong' ? 'text-emerald-400' : 'text-red-400'}`}>
              {sectorLabel(q, experienceMode)}
            </span>
          )}
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center justify-between pt-1 border-t border-[#1e1e1e]">
        <button
          onClick={() => setShowOptions((p) => !p)}
          className={`text-xs font-semibold transition-colors px-2.5 py-1 rounded-lg ${
            showOptions
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'text-gray-500 hover:text-gray-300 border border-[#2a2a2a] hover:border-[#3a3a3a]'
          }`}
        >
          {showOptions ? '▼ Contracts' : '▶ Contracts'}
        </button>
        <TradingViewButton symbol={q.symbol} label="Chart" />
      </div>

      {/* Expandable options panel */}
      {showOptions && <OptionsPanel symbol={q.symbol} />}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

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

  const intraday = [...allQuotes]
    .filter((q) => (q.rvol ?? 0) >= rvolThreshold || q.newHighDay)
    .sort((a, b) => computeOpportunityScore(b, rvolThreshold) - computeOpportunityScore(a, rvolThreshold));

  const unusual = intraday.filter((q) => (q.rvol ?? 0) >= 2);
  const regular = intraday.filter((q) => (q.rvol ?? 0) < 2);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Intraday Options</h1>
        <p className="text-sm text-gray-500 mt-1">
          Unusual volume scan · same-day option contracts · calls &amp; puts
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-[#111111] border border-[#1e1e1e] rounded-2xl">
        <div className="flex rounded-full overflow-hidden border border-[#2a2a2a] bg-[#0d0d0d]">
          <button
            onClick={() => setScanMode('watchlist')}
            className={`px-4 py-1.5 text-xs font-semibold transition-all rounded-full ${
              scanMode === 'watchlist'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Watchlist ({watchlist.length})
          </button>
          <button
            onClick={() => setScanMode('market')}
            className={`px-4 py-1.5 text-xs font-semibold transition-all rounded-full ${
              scanMode === 'market'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Market Scan ({MARKET_TICKERS.length})
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500 uppercase tracking-wider font-semibold">RVOL ≥</span>
          <input
            type="number"
            value={rvolThreshold}
            step={0.1} min={0.5} max={10}
            onChange={(e) => setRvolThreshold(parseFloat(e.target.value) || 1.5)}
            className="w-16 bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-emerald-500/50"
          />
        </div>

        <button
          onClick={load}
          disabled={loading}
          className="px-4 py-1.5 text-xs font-semibold bg-[#1a1a1a] border border-[#2a2a2a] rounded-full text-gray-300 hover:border-emerald-500/30 hover:text-white transition-all disabled:opacity-50"
        >
          {loading ? 'Loading...' : '↻ Refresh'}
        </button>

        <div className="ml-auto">
          {data && <SourceTag source={data.source ?? 'Loading...'} lastUpdated={data.lastUpdated} />}
        </div>
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      {/* ── Unusual Volume ── */}
      {unusual.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-amber-400 font-bold text-sm uppercase tracking-widest">🔥 Unusual Volume</h2>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {unusual.length}
            </span>
            <span className="text-xs text-gray-600">RVOL 2x+ — high conviction moves</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {unusual.map((q) => (
              <CandidateCard key={q.symbol} q={q} rvolThreshold={rvolThreshold} />
            ))}
          </div>
        </section>
      )}

      {/* ── All Intraday Candidates ── */}
      {regular.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-white font-bold text-sm uppercase tracking-widest">
              Intraday Candidates
            </h2>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[#1e1e1e] text-gray-400 border border-[#2a2a2a]">
              {regular.length}
            </span>
            <span className="text-xs text-gray-600">RVOL ≥ {rvolThreshold} or new day high</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {regular.map((q) => (
              <CandidateCard key={q.symbol} q={q} rvolThreshold={rvolThreshold} />
            ))}
          </div>
        </section>
      )}

      {!loading && intraday.length === 0 && !data?.sourceError && (
        <div className="text-center py-12 text-gray-600">
          No intraday candidates at this RVOL threshold. Try lowering it or switching to Market Scan.
        </div>
      )}

      <p className="text-xs text-gray-700">
        Opening range, VWAP, and structure confirmed live on TradingView. Option contracts filtered Δ 0.20–0.70. All plays are options, not shares.
      </p>
    </div>
  );
}

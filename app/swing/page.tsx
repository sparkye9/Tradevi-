'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import TradingViewButton from '@/components/ui/TradingViewButton';
import ManualChecklist from '@/components/ui/ManualChecklist';
import OptionsPanel from '@/components/options/OptionsPanel';
import { useTradeviStore, MARKET_TICKERS } from '@/store/tradeviStore';
import { computeOpportunityScore, generateReason, generateBeginnerReason } from '@/lib/opportunityScore';
import { isBeginner, isAdvanced, volumeLabel, trendLabel, sectorLabel } from '@/lib/labels';
import type { FinvizQuote, FinvizResult } from '@/lib/finviz';

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 75 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-gray-500';
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-gray-600 uppercase tracking-wider">Score</span>
      <span className={`text-sm font-bold font-mono ${color}`}>{score}</span>
    </div>
  );
}

function SwingCard({
  q,
  direction,
  rvolThreshold,
}: {
  q: FinvizQuote;
  direction: 'LONG' | 'SHORT';
  rvolThreshold: number;
}) {
  const { experienceMode } = useTradeviStore();
  const beginner = isBeginner(experienceMode);
  const advanced = isAdvanced(experienceMode);
  const [expanded, setExpanded] = useState(false);
  const [showOptions, setShowOptions] = useState(true);
  const score = computeOpportunityScore(q, rvolThreshold);
  const reason = beginner ? generateBeginnerReason(q) : generateReason(q);
  const chgColor = (q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="card card-hover flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold font-mono text-xl">{q.symbol}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
            direction === 'LONG'
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              : 'bg-red-500/20 text-red-400 border-red-500/30'
          }`}>
            {direction}
          </span>
          {sectorLabel(q, experienceMode) && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
              q.groupStrength === 'strong'
                ? 'bg-emerald-900/30 text-emerald-400 border-emerald-900'
                : 'bg-red-900/30 text-red-400 border-red-900'
            }`}>
              {sectorLabel(q, experienceMode)}
            </span>
          )}
        </div>
        <ScoreBadge score={score} />
      </div>

      {/* Price + change */}
      <div className="flex items-center gap-3">
        <span className="text-white font-mono font-semibold text-lg">
          {q.price !== null ? `$${q.price.toFixed(2)}` : '--'}
        </span>
        <span className={`font-mono font-semibold text-base ${chgColor}`}>
          {q.changePercent !== null ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%` : '--'}
        </span>
        {q.unusualVolume && (
          <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            {beginner ? 'Heavy volume' : `RVOL ${q.rvol!.toFixed(2)}`}
          </span>
        )}
      </div>

      {/* Trend row */}
      <div className="flex items-center gap-4 text-xs font-mono">
        <span className={q.sma50rel === 'above' ? 'text-emerald-400' : q.sma50rel === 'below' ? 'text-red-400' : 'text-gray-600'}>
          {trendLabel(q, experienceMode)}
        </span>
        {!q.unusualVolume && q.rvol !== null && (
          <span className="text-gray-600">{volumeLabel(q, experienceMode)}</span>
        )}
      </div>

      {/* Why it ranked here */}
      <p className="text-xs text-gray-500 leading-relaxed">{reason}</p>

      {/* Manual structure checklist — Advanced mode only */}
      {advanced && (
        <div>
          <button
            onClick={() => setExpanded((p) => !p)}
            className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
          >
            <span>{expanded ? '▼' : '▶'}</span>
            <span>Manual Structure Checklist</span>
          </button>
          {expanded && (
            <div className="mt-2">
              <ManualChecklist symbol={q.symbol} />
            </div>
          )}
        </div>
      )}

      {/* Options panel */}
      <div className="pt-1 border-t border-[#1e1e1e]">
        <button
          onClick={() => setShowOptions((p) => !p)}
          className={`text-xs font-semibold transition-colors px-2.5 py-1 rounded-lg mb-2 ${
            showOptions
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'text-gray-500 hover:text-gray-300 border border-[#2a2a2a] hover:border-[#3a3a3a]'
          }`}
        >
          {showOptions ? '▼ Contracts' : '▶ Contracts'}
        </button>
        {showOptions && <OptionsPanel symbol={q.symbol} bordered={false} />}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end pt-1 border-t border-[#1e1e1e]">
        <TradingViewButton symbol={q.symbol} />
      </div>
    </div>
  );
}

function UnusualVolumeCard({ q }: { q: FinvizQuote }) {
  const { experienceMode } = useTradeviStore();
  return (
    <div className="bg-[#111111] border border-amber-500/30 rounded-2xl p-4 flex flex-col gap-2 hover:bg-[#161616] hover:border-amber-500/50 transition-all">
      <div className="flex items-center justify-between">
        <span className="text-white font-bold font-mono text-xl">{q.symbol}</span>
        <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
          {volumeLabel(q, experienceMode)}
        </span>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-white font-mono font-semibold">
          {q.price !== null ? `$${q.price.toFixed(2)}` : '--'}
        </span>
        <span className={`font-mono font-semibold ${(q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {q.changePercent !== null ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%` : '--'}
        </span>
        {q.newHighDay && (
          <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            NEW HIGH
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className={`text-xs font-mono ${q.sma50rel === 'above' ? 'text-emerald-400' : 'text-red-400'}`}>
          {trendLabel(q, experienceMode)}
        </span>
        <TradingViewButton symbol={q.symbol} label="Chart" />
      </div>
    </div>
  );
}

export default function SwingPage() {
  const { watchlist, rvolThreshold, scanMode, setScanMode } = useTradeviStore();
  const [data, setData] = useState<FinvizResult<FinvizQuote> | null>(null);
  const [loading, setLoading] = useState(true);

  const tickers = scanMode === 'market' ? MARKET_TICKERS : watchlist;

  useEffect(() => {
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
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanMode, watchlist]);

  const allQuotes = data?.data ?? [];

  const longCandidates = allQuotes.filter(
    (q) => q.sma50rel === 'above' && q.sma200rel === 'above' && q.groupStrength === 'strong'
  );
  const shortCandidates = allQuotes.filter(
    (q) => q.sma50rel === 'below' && q.sma200rel === 'below' && q.groupStrength === 'weak'
  );
  const unusualVolumeItems = allQuotes
    .filter((q) => q.unusualVolume === true && q.sma50rel === 'above' && (q.rvol ?? 0) >= 2)
    .sort((a, b) => (b.rvol ?? 0) - (a.rvol ?? 0));

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Swing Options</h1>
        <p className="text-sm text-gray-500 mt-1">Multi-day option plays — calls &amp; puts on trending names</p>
      </div>

      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Scan mode toggle */}
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

        <div className="ml-auto flex items-center gap-4">
          {data && <SourceTag source={data.source ?? 'Finviz'} lastUpdated={data.lastUpdated} />}
          {loading && <span className="text-gray-500 text-sm">Loading...</span>}
        </div>
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      <div className="text-xs text-gray-600">
        Long: above SMA 50 + SMA 200 + group strong. Short: below SMA 50 + SMA 200 + group weak.
        Daily and 4H structure is read on TradingView.
      </div>

      {/* Unusual Volume section */}
      {unusualVolumeItems.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-amber-400 font-bold text-sm uppercase tracking-widest">
              🔥 Unusual Volume
            </h2>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {unusualVolumeItems.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {unusualVolumeItems.map((q) => (
              <UnusualVolumeCard key={q.symbol} q={q} />
            ))}
          </div>
          <div className="border-t border-[#1e1e1e] pt-4 mt-4" />
        </section>
      )}

      {/* Long candidates */}
      {longCandidates.length > 0 && (
        <section>
          <h2 className="text-emerald-400 font-semibold text-sm mb-3 uppercase tracking-widest">
            Long Candidates ({longCandidates.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {longCandidates.map((q) => (
              <SwingCard key={q.symbol} q={q} direction="LONG" rvolThreshold={rvolThreshold} />
            ))}
          </div>
        </section>
      )}

      {/* Short candidates */}
      {shortCandidates.length > 0 && (
        <section>
          <h2 className="text-red-400 font-semibold text-sm mb-3 uppercase tracking-widest">
            Short Candidates ({shortCandidates.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {shortCandidates.map((q) => (
              <SwingCard key={q.symbol} q={q} direction="SHORT" rvolThreshold={rvolThreshold} />
            ))}
          </div>
        </section>
      )}

      {!loading && longCandidates.length === 0 && shortCandidates.length === 0 && !data?.sourceError && (
        <div className="text-gray-500 text-sm">No swing candidates meet the filter criteria.</div>
      )}
    </div>
  );
}

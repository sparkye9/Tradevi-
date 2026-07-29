'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import TradingViewButton from '@/components/ui/TradingViewButton';
import OpportunityCard from '@/components/scan/OpportunityCard';
import PowerHourGuide from '@/components/scan/PowerHourGuide';
import { useTradeviStore, MARKET_TICKERS } from '@/store/tradeviStore';
import { computeOpportunityScore } from '@/lib/opportunityScore';
import { volumeLabel, trendLabel, isAdvanced } from '@/lib/labels';
import type { FinvizQuote, FinvizResult } from '@/lib/finviz';

type Timeframe = 'intraday' | 'swing' | 'power-hour' | 'all';

const TIMEFRAMES: { id: Timeframe; label: string; sub: string; advancedOnly?: boolean }[] = [
  { id: 'intraday', label: 'Intraday', sub: 'Same-day options' },
  { id: 'swing', label: 'Swing', sub: 'Multi-day plays' },
  { id: 'power-hour', label: 'Power Hour', sub: '3–4 PM ET' },
  { id: 'all', label: 'All', sub: 'Full candidate table', advancedOnly: true },
];

function UnusualVolumeCard({ q, label }: { q: FinvizQuote; label: string }) {
  const { experienceMode } = useTradeviStore();
  return (
    <div className="bg-[#111111] border border-amber-500/30 rounded-2xl p-4 flex flex-col gap-2 hover:bg-[#161616] hover:border-amber-500/50 transition-all">
      <div className="flex items-center justify-between">
        <span className="text-white font-bold font-mono text-xl">{q.symbol}</span>
        <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
          {label}
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

export default function ScannerPage() {
  const { watchlist, rvolThreshold, setRvolThreshold, scanMode, setScanMode, experienceMode } = useTradeviStore();
  const [timeframe, setTimeframe] = useState<Timeframe>('intraday');
  const [data, setData] = useState<FinvizResult<FinvizQuote> | null>(null);
  const [loading, setLoading] = useState(true);
  const advanced = isAdvanced(experienceMode);

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

  // Advanced-only "All" tab isn't reachable from Beginner/Intermediate — fall back if the mode changes under you.
  useEffect(() => {
    if (timeframe === 'all' && !advanced) setTimeframe('intraday');
  }, [advanced, timeframe]);

  const allQuotes = data?.data ?? [];
  const powerThreshold = rvolThreshold * 1.2;

  // ── Intraday ──
  const intradayAll = [...allQuotes]
    .filter((q) => (q.rvol ?? 0) >= rvolThreshold || q.newHighDay)
    .sort((a, b) => computeOpportunityScore(b, rvolThreshold) - computeOpportunityScore(a, rvolThreshold));
  const intradayUnusual = intradayAll.filter((q) => (q.rvol ?? 0) >= 2);
  const intradayRegular = intradayAll.filter((q) => (q.rvol ?? 0) < 2);

  // ── Power Hour ──
  const powerAll = [...allQuotes]
    .filter((q) => q.newHighDay || (q.rvol ?? 0) >= powerThreshold || Math.abs(q.changePercent ?? 0) >= 2)
    .sort((a, b) => computeOpportunityScore(b, powerThreshold) - computeOpportunityScore(a, powerThreshold));
  const powerUnusual = powerAll.filter((q) => (q.rvol ?? 0) >= 2);
  const powerRegular = powerAll.filter((q) => (q.rvol ?? 0) < 2);

  // ── Swing ──
  const swingLong = allQuotes.filter(
    (q) => q.sma50rel === 'above' && q.sma200rel === 'above' && q.groupStrength === 'strong'
  );
  const swingShort = allQuotes.filter(
    (q) => q.sma50rel === 'below' && q.sma200rel === 'below' && q.groupStrength === 'weak'
  );
  const swingUnusual = allQuotes
    .filter((q) => q.unusualVolume === true && q.sma50rel === 'above' && (q.rvol ?? 0) >= 2)
    .sort((a, b) => (b.rvol ?? 0) - (a.rvol ?? 0));

  // ── All / Hidden Gems (Advanced) ──
  const MEGA_CAPS = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'TSLA', 'SPY', 'QQQ', 'IWM', 'DIA'];
  const hiddenGems = [...allQuotes]
    .filter((q) => (q.rvol ?? 0) >= 3 && !MEGA_CAPS.includes(q.symbol) && Math.abs(q.changePercent ?? 0) >= 1.5)
    .sort((a, b) => (b.rvol ?? 0) - (a.rvol ?? 0))
    .slice(0, 12);
  const sortedAll = [...allQuotes].sort(
    (a, b) => computeOpportunityScore(b, rvolThreshold) - computeOpportunityScore(a, rvolThreshold)
  );

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Scanner</h1>
        <p className="text-sm text-gray-500 mt-1">One engine, one score — pick a timeframe.</p>
      </div>

      {/* Timeframe tabs */}
      <div className="flex rounded-full overflow-hidden border border-[#2a2a2a] bg-[#0d0d0d] w-fit">
        {TIMEFRAMES.filter((t) => !t.advancedOnly || advanced).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTimeframe(id)}
            className={`px-4 py-1.5 text-xs font-semibold transition-all rounded-full ${
              timeframe === id
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {timeframe === 'power-hour' && <PowerHourGuide />}

      {/* Controls bar */}
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

        {(timeframe === 'intraday' || timeframe === 'all') && (
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
        )}

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

      {/* ── Intraday tab ── */}
      {timeframe === 'intraday' && (
        <>
          {intradayUnusual.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-amber-400 font-bold text-sm uppercase tracking-widest">🔥 Unusual Volume</h2>
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">{intradayUnusual.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {intradayUnusual.map((q) => <OpportunityCard key={q.symbol} q={q} rvolThreshold={rvolThreshold} timeframe="intraday" />)}
              </div>
            </section>
          )}
          {intradayRegular.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-white font-bold text-sm uppercase tracking-widest">Intraday Candidates</h2>
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[#1e1e1e] text-gray-400 border border-[#2a2a2a]">{intradayRegular.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {intradayRegular.map((q) => <OpportunityCard key={q.symbol} q={q} rvolThreshold={rvolThreshold} timeframe="intraday" />)}
              </div>
            </section>
          )}
          {!loading && intradayAll.length === 0 && !data?.sourceError && (
            <div className="text-center py-12 text-gray-600">No intraday candidates at this RVOL threshold. Try lowering it or switching to Market Scan.</div>
          )}
        </>
      )}

      {/* ── Power Hour tab ── */}
      {timeframe === 'power-hour' && (
        <>
          {powerUnusual.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-amber-400 font-bold text-sm uppercase tracking-widest">🔥 Unusual Volume</h2>
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">{powerUnusual.length}</span>
                <span className="text-xs text-gray-600">strongest conviction into close</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {powerUnusual.map((q) => <OpportunityCard key={q.symbol} q={q} rvolThreshold={powerThreshold} timeframe="intraday" />)}
              </div>
            </section>
          )}
          {powerRegular.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-white font-bold text-sm uppercase tracking-widest">All Candidates</h2>
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[#1e1e1e] text-gray-400 border border-[#2a2a2a]">{powerRegular.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {powerRegular.map((q) => <OpportunityCard key={q.symbol} q={q} rvolThreshold={powerThreshold} timeframe="intraday" />)}
              </div>
            </section>
          )}
          {!loading && powerAll.length === 0 && !data?.sourceError && (
            <div className="text-center py-12 text-gray-600">No power hour candidates yet. Try Market Scan or check back closer to 3 PM ET.</div>
          )}
        </>
      )}

      {/* ── Swing tab ── */}
      {timeframe === 'swing' && (
        <>
          <div className="text-xs text-gray-600">
            Long: above SMA 50 + SMA 200 + group strong. Short: below SMA 50 + SMA 200 + group weak.
          </div>
          {swingUnusual.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-amber-400 font-bold text-sm uppercase tracking-widest">🔥 Unusual Volume</h2>
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">{swingUnusual.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {swingUnusual.map((q) => <UnusualVolumeCard key={q.symbol} q={q} label={volumeLabel(q, experienceMode)} />)}
              </div>
            </section>
          )}
          {swingLong.length > 0 && (
            <section>
              <h2 className="text-emerald-400 font-semibold text-sm mb-3 uppercase tracking-widest">Long Candidates ({swingLong.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {swingLong.map((q) => <OpportunityCard key={q.symbol} q={q} rvolThreshold={rvolThreshold} timeframe="swing" />)}
              </div>
            </section>
          )}
          {swingShort.length > 0 && (
            <section>
              <h2 className="text-red-400 font-semibold text-sm mb-3 uppercase tracking-widest">Short Candidates ({swingShort.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {swingShort.map((q) => <OpportunityCard key={q.symbol} q={q} rvolThreshold={rvolThreshold} timeframe="swing" />)}
              </div>
            </section>
          )}
          {!loading && swingLong.length === 0 && swingShort.length === 0 && !data?.sourceError && (
            <div className="text-gray-500 text-sm">No swing candidates meet the filter criteria.</div>
          )}
        </>
      )}

      {/* ── All / Advanced tab ── */}
      {timeframe === 'all' && advanced && (
        <>
          {hiddenGems.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-purple-400 font-bold text-sm uppercase tracking-widest">💎 Hidden Gems</h2>
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">{hiddenGems.length}</span>
                <span className="text-xs text-gray-600">RVOL 3x+ — strong momentum, not the obvious names</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {hiddenGems.map((q) => <UnusualVolumeCard key={q.symbol} q={q} label={volumeLabel(q, experienceMode)} />)}
              </div>
            </section>
          )}
          <section>
            <h2 className="label mb-3 text-xs uppercase tracking-widest text-gray-500">All Candidates</h2>
            <div className="overflow-x-auto rounded-2xl border border-[#1e1e1e]">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left border-b border-[#2a2a2a] bg-[#0f0f0f]">
                    <th className="py-2.5 px-3 label">Symbol</th>
                    <th className="py-2.5 px-3 label">Price</th>
                    <th className="py-2.5 px-3 label">% Chg</th>
                    <th className="py-2.5 px-3 label">RVOL</th>
                    <th className="py-2.5 px-3 label">SMA</th>
                    <th className="py-2.5 px-3 label">Group</th>
                    <th className="py-2.5 px-3 label">Score</th>
                    <th className="py-2.5 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAll.map((q, idx) => {
                    const score = computeOpportunityScore(q, rvolThreshold);
                    const scoreColor = score >= 75 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-gray-500';
                    const rowBg = idx % 2 === 0 ? 'bg-[#111111]' : 'bg-[#0d0d0d]';
                    return (
                      <tr key={q.symbol} className={`${rowBg} border-b border-[#1a1a1a] hover:bg-[#161616] transition-colors`}>
                        <td className="py-2.5 px-3 font-mono font-bold text-white">{q.symbol}</td>
                        <td className="py-2.5 px-3 font-mono text-gray-200">{q.price !== null ? `$${q.price.toFixed(2)}` : '--'}</td>
                        <td className={`py-2.5 px-3 font-mono font-semibold ${(q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {q.changePercent !== null ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%` : '--'}
                        </td>
                        <td className={`py-2.5 px-3 font-mono font-semibold ${(q.rvol ?? 0) >= rvolThreshold ? 'text-amber-400' : 'text-gray-500'}`}>
                          {q.rvol !== null ? q.rvol.toFixed(2) : '--'}
                        </td>
                        <td className="py-2.5 px-3 text-xs font-mono">
                          <span className={q.sma50rel === 'above' ? 'text-emerald-400' : 'text-red-400'}>50{q.sma50rel === 'above' ? '▲' : '▼'}</span>
                          {' '}
                          <span className={q.sma200rel === 'above' ? 'text-emerald-400' : 'text-red-400'}>200{q.sma200rel === 'above' ? '▲' : '▼'}</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`text-xs font-semibold ${q.groupStrength === 'strong' ? 'text-emerald-400' : q.groupStrength === 'weak' ? 'text-red-400' : 'text-gray-600'}`}>
                            {q.groupStrength ?? '--'}
                          </span>
                        </td>
                        <td className={`py-2.5 px-3 font-mono font-bold ${scoreColor}`}>{score}</td>
                        <td className="py-2.5 px-3"><TradingViewButton symbol={q.symbol} label="Chart" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <p className="text-xs text-gray-700">
        Structure (CHOCH, BOS, FVG, VWAP) read live on TradingView — not computed here. Options filtered Δ 0.20–0.70.
      </p>
    </div>
  );
}

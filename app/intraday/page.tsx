'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import ManualChecklist from '@/components/ui/ManualChecklist';
import TradingViewButton from '@/components/ui/TradingViewButton';
import { useTradeviStore } from '@/store/tradeviStore';
import type { FinvizQuote, FinvizResult } from '@/lib/finviz';

const FOCUS = ['SPY', 'QQQ'];

function OrbInput({ symbol }: { symbol: string }) {
  const { orbLevels, setOrbLevel } = useTradeviStore();
  const orb = orbLevels[symbol] ?? { high: null, low: null };
  const [high, setHigh] = useState(orb.high?.toString() ?? '');
  const [low, setLow] = useState(orb.low?.toString() ?? '');

  function save() {
    const h = parseFloat(high) || null;
    const l = parseFloat(low) || null;
    setOrbLevel(symbol, h, l);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="label">ORB</span>
      <input
        type="number"
        value={high}
        onChange={(e) => setHigh(e.target.value)}
        placeholder="High"
        className="w-24 bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-emerald-500/50"
      />
      <input
        type="number"
        value={low}
        onChange={(e) => setLow(e.target.value)}
        placeholder="Low"
        className="w-24 bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-emerald-500/50"
      />
      <button
        onClick={save}
        className="px-3 py-1.5 text-xs font-semibold bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-white hover:bg-[#222] hover:border-emerald-500/30 transition-all"
      >
        Save
      </button>
      {orb.high !== null && orb.low !== null && (
        <span className="text-xs text-emerald-400 font-mono">
          ${orb.high.toFixed(2)} / ${orb.low.toFixed(2)}
        </span>
      )}
    </div>
  );
}

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

function UnusualVolumeCard({ q }: { q: FinvizQuote }) {
  return (
    <div className="bg-[#111111] border border-amber-500/30 rounded-2xl p-4 flex flex-col gap-2 hover:bg-[#161616] hover:border-amber-500/50 transition-all">
      <div className="flex items-center justify-between">
        <span className="text-white font-bold font-mono text-xl">{q.symbol}</span>
        <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
          RVOL {q.rvol !== null ? q.rvol.toFixed(2) : '--'}
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
        <SmaLabel q={q} />
        <TradingViewButton symbol={q.symbol} label="Chart" />
      </div>
    </div>
  );
}

export default function IntradayPage() {
  const { watchlist, rvolThreshold } = useTradeviStore();
  const [data, setData] = useState<FinvizResult<FinvizQuote> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const allSet = new Set([...FOCUS, ...watchlist]);
        const all = Array.from(allSet);
        const res = await fetch(`/api/finviz/screener?tickers=${all.join(',')}`);
        const json = await res.json();
        setData(json);
      } catch {
        setData({ data: [], sourceError: 'Fetch failed', lastUpdated: new Date().toISOString() });
      }
      setLoading(false);
    }
    load();
  }, [watchlist]);

  const allQuotes = data?.data ?? [];
  const focusQuotes = allQuotes.filter((q) => FOCUS.includes(q.symbol));
  const candidateQuotes = allQuotes.filter((q) => !FOCUS.includes(q.symbol));
  const intradayCandidates = candidateQuotes
    .filter((q) => (q.rvol ?? 0) > rvolThreshold || q.newHighDay)
    .sort((a, b) => (b.rvol ?? 0) - (a.rvol ?? 0));

  const unusualVolumeItems = candidateQuotes
    .filter((q) => q.unusualVolume === true && (q.rvol ?? 0) >= 2)
    .sort((a, b) => (b.rvol ?? 0) - (a.rvol ?? 0));

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Intraday</h1>
        <p className="text-sm text-gray-500 mt-1">What is my plan for today on SPY and QQQ?</p>
      </div>

      <div className="flex items-center gap-4">
        {data && <SourceTag source={data.source ?? 'Finviz'} lastUpdated={data.lastUpdated} />}
        {loading && <span className="text-gray-500 text-sm">Loading...</span>}
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      <div className="text-xs text-gray-600 p-3 rounded-2xl bg-[#111111] border border-[#1e1e1e]">
        Opening range, VWAP, and structure are read live on TradingView. Enter your ORB levels
        after the first 5–15 minutes.
      </div>

      {/* SPY and QQQ focus cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FOCUS.map((sym) => {
          const q = focusQuotes.find((f) => f.symbol === sym);
          const chgColor = q ? ((q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-gray-500';
          return (
            <div key={sym} className="card space-y-4">
              {/* Symbol + change */}
              <div className="flex items-center justify-between">
                <span className="text-white font-bold text-2xl font-mono">{sym}</span>
                {q && (
                  <span className={`font-mono font-semibold text-lg ${chgColor}`}>
                    {q.changePercent !== null
                      ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%`
                      : '--'}
                  </span>
                )}
              </div>

              {q ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="label block mb-0.5">Price</span>
                    <span className="value text-base">{q.price !== null ? `$${q.price.toFixed(2)}` : '--'}</span>
                  </div>
                  <div>
                    <span className="label block mb-0.5">RVOL</span>
                    <span className={`font-mono font-semibold text-base ${(q.rvol ?? 0) >= rvolThreshold ? 'text-amber-400' : 'text-white'}`}>
                      {q.rvol !== null ? q.rvol.toFixed(2) : '--'}
                    </span>
                  </div>
                  <div>
                    <span className="label block mb-0.5">Gap</span>
                    <span className="value text-base">{q.gap !== null ? `${q.gap.toFixed(2)}%` : '--'}</span>
                  </div>
                  <div>
                    <span className="label block mb-0.5">Group</span>
                    <span className={`font-mono font-semibold text-base ${
                      q.groupStrength === 'strong' ? 'text-emerald-400' :
                      q.groupStrength === 'weak' ? 'text-red-400' : 'text-gray-400'
                    }`}>{q.groupStrength ?? '--'}</span>
                  </div>
                </div>
              ) : (
                <DataUnavailable symbol={sym} />
              )}

              <OrbInput symbol={sym} />
              <ManualChecklist symbol={sym} />
              <TradingViewButton symbol={sym} />
            </div>
          );
        })}
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
        </section>
      )}

      {/* Intraday candidates table */}
      {intradayCandidates.length > 0 && (
        <section>
          <h2 className="label mb-3">
            Watchlist Intraday Candidates ({intradayCandidates.length})
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-[#1e1e1e]">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-[#2a2a2a] bg-[#0f0f0f]">
                  <th className="py-2.5 px-3 label">Symbol</th>
                  <th className="py-2.5 px-3 label">Price</th>
                  <th className="py-2.5 px-3 label">% Chg</th>
                  <th className="py-2.5 px-3 label">RVOL</th>
                  <th className="py-2.5 px-3 label">New High</th>
                  <th className="py-2.5 px-3 label">SMA</th>
                  <th className="py-2.5 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {intradayCandidates.map((q, idx) => {
                  const rowBg = idx % 2 === 0 ? 'bg-[#111111]' : 'bg-[#0d0d0d]';
                  return (
                    <tr key={q.symbol} className={`${rowBg} border-b border-[#1a1a1a] hover:bg-[#161616] transition-colors`}>
                      <td className="py-2.5 px-3 font-mono font-bold text-white">{q.symbol}</td>
                      <td className="py-2.5 px-3 font-mono text-gray-200">
                        {q.price !== null ? `$${q.price.toFixed(2)}` : '--'}
                      </td>
                      <td className={`py-2.5 px-3 font-mono font-semibold ${
                        (q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {q.changePercent !== null
                          ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%`
                          : '--'}
                      </td>
                      <td className={`py-2.5 px-3 font-mono font-semibold ${
                        (q.rvol ?? 0) >= rvolThreshold ? 'text-amber-400' : 'text-gray-500'
                      }`}>
                        {q.rvol !== null ? q.rvol.toFixed(2) : '--'}
                      </td>
                      <td className="py-2.5 px-3">
                        {q.newHighDay ? (
                          <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">NEW</span>
                        ) : (
                          <span className="text-gray-700 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <SmaLabel q={q} />
                      </td>
                      <td className="py-2.5 px-3">
                        <TradingViewButton symbol={q.symbol} label="Chart" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

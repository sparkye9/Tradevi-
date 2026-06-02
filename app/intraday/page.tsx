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
      <span className="text-xs text-gray-500">ORB:</span>
      <input
        type="number"
        value={high}
        onChange={(e) => setHigh(e.target.value)}
        placeholder="High"
        className="w-24 bg-[#111] border border-[#2a2a2a] rounded px-2 py-1 text-white text-xs"
      />
      <input
        type="number"
        value={low}
        onChange={(e) => setLow(e.target.value)}
        placeholder="Low"
        className="w-24 bg-[#111] border border-[#2a2a2a] rounded px-2 py-1 text-white text-xs"
      />
      <button
        onClick={save}
        className="px-2 py-1 text-xs bg-[#252525] border border-[#2a2a2a] rounded text-white hover:bg-[#2a2a2a]"
      >
        Save
      </button>
      {orb.high !== null && orb.low !== null && (
        <span className="text-xs text-gray-400">
          Saved: ${orb.high.toFixed(2)} / ${orb.low.toFixed(2)}
        </span>
      )}
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
  const intradayCandidates = allQuotes
    .filter((q) => !FOCUS.includes(q.symbol))
    .filter((q) => (q.rvol ?? 0) > rvolThreshold || q.newHighDay)
    .sort((a, b) => (b.rvol ?? 0) - (a.rvol ?? 0));

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-white">Intraday</h1>
        <p className="text-gray-500 text-sm mt-0.5">What is my plan for today on SPY and QQQ?</p>
      </div>

      <div className="flex items-center gap-4">
        {data && <SourceTag source="Finviz Elite" lastUpdated={data.lastUpdated} />}
        {loading && <span className="text-gray-500 text-sm">Loading...</span>}
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      <div className="text-xs text-gray-600 p-3 rounded bg-[#1a1a1a] border border-[#2a2a2a]">
        Opening range, VWAP, and structure are read live on TradingView. Enter your ORB levels
        after the first 5-15 minutes.
      </div>

      {/* SPY and QQQ focus */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FOCUS.map((sym) => {
          const q = focusQuotes.find((f) => f.symbol === sym);
          return (
            <div key={sym} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-white font-bold text-base">{sym}</span>
                {q && (
                  <span className={`font-mono text-sm ${
                    (q.changePercent ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {q.changePercent !== null
                      ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%`
                      : '--'}
                  </span>
                )}
              </div>

              {q && (
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                  <div>Price: <span className="text-white font-mono">{q.price !== null ? `$${q.price.toFixed(2)}` : '--'}</span></div>
                  <div>RVOL: <span className="text-white font-mono">{q.rvol !== null ? q.rvol.toFixed(2) : '--'}</span></div>
                  <div>Gap: <span className="text-white font-mono">{q.gap !== null ? `${q.gap.toFixed(2)}%` : '--'}</span></div>
                  <div>Group: <span className={`font-mono ${
                    q.groupStrength === 'strong' ? 'text-green-400' :
                    q.groupStrength === 'weak' ? 'text-red-400' : 'text-gray-400'
                  }`}>{q.groupStrength ?? '--'}</span></div>
                </div>
              )}

              {!q && <DataUnavailable symbol={sym} />}

              <OrbInput symbol={sym} />
              <ManualChecklist symbol={sym} />
              <TradingViewButton symbol={sym} />
            </div>
          );
        })}
      </div>

      {/* Full watchlist intraday candidates */}
      {intradayCandidates.length > 0 && (
        <section>
          <h2 className="text-white font-semibold text-sm mb-3">
            Watchlist intraday candidates ({intradayCandidates.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-gray-500 border-b border-[#2a2a2a]">
                  <th className="py-2 pr-4">Symbol</th>
                  <th className="py-2 pr-4">Price</th>
                  <th className="py-2 pr-4">% Chg</th>
                  <th className="py-2 pr-4">RVOL</th>
                  <th className="py-2 pr-4">New High</th>
                  <th className="py-2">Chart</th>
                </tr>
              </thead>
              <tbody>
                {intradayCandidates.map((q) => (
                  <tr key={q.symbol} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a]">
                    <td className="py-2 pr-4 font-mono font-bold text-white">{q.symbol}</td>
                    <td className="py-2 pr-4 font-mono text-gray-200">
                      {q.price !== null ? `$${q.price.toFixed(2)}` : '--'}
                    </td>
                    <td className={`py-2 pr-4 font-mono ${
                      (q.changePercent ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {q.changePercent !== null
                        ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%`
                        : '--'}
                    </td>
                    <td className={`py-2 pr-4 font-mono ${
                      (q.rvol ?? 0) >= rvolThreshold ? 'text-green-400' : 'text-gray-400'
                    }`}>
                      {q.rvol !== null ? q.rvol.toFixed(2) : '--'}
                    </td>
                    <td className="py-2 pr-4">
                      {q.newHighDay ? <span className="text-green-500">Y</span> : <span className="text-gray-600">N</span>}
                    </td>
                    <td className="py-2">
                      <TradingViewButton symbol={q.symbol} label="Chart" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

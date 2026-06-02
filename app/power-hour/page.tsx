'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import TradingViewButton from '@/components/ui/TradingViewButton';
import { useTradeviStore } from '@/store/tradeviStore';
import type { FinvizQuote, FinvizResult } from '@/lib/finviz';

function UnusualVolumeCard({ q, powerThreshold }: { q: FinvizQuote; powerThreshold: number }) {
  return (
    <div className="bg-[#111111] border border-amber-500/30 rounded-2xl p-4 flex flex-col gap-2 hover:bg-[#161616] hover:border-amber-500/50 transition-all">
      <div className="flex items-center justify-between">
        <span className="text-white font-bold font-mono text-xl">{q.symbol}</span>
        <div className="flex gap-1.5 flex-wrap justify-end">
          {(q.rvol ?? 0) >= powerThreshold && (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              RVOL {q.rvol!.toFixed(2)}
            </span>
          )}
          {q.newHighDay && (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              NEW HIGH
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-white font-mono font-semibold">
          {q.price !== null ? `$${q.price.toFixed(2)}` : '--'}
        </span>
        <span className={`font-mono font-semibold ${(q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {q.changePercent !== null ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%` : '--'}
        </span>
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-gray-600">VWAP: confirm on TradingView</span>
        <TradingViewButton symbol={q.symbol} label="Chart" />
      </div>
    </div>
  );
}

export default function PowerHourPage() {
  const { watchlist, rvolThreshold } = useTradeviStore();
  const [data, setData] = useState<FinvizResult<FinvizQuote> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/finviz/screener?tickers=${watchlist.join(',')}`);
        const json = await res.json();
        setData(json);
      } catch {
        setData({ data: [], sourceError: 'Fetch failed', lastUpdated: new Date().toISOString() });
      }
      setLoading(false);
    }
    load();
  }, [watchlist]);

  const powerThreshold = rvolThreshold * 1.2;
  const candidates = [...(data?.data ?? [])]
    .filter(
      (q) =>
        q.newHighDay ||
        (q.rvol ?? 0) > powerThreshold ||
        (q.changePercent ?? 0) > 2
    )
    .sort((a, b) => (b.rvol ?? 0) - (a.rvol ?? 0));

  const unusualVolumeItems = candidates.filter(
    (q) => q.unusualVolume === true && (q.rvol ?? 0) >= 2
  );

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Power Hour</h1>
        <p className="text-sm text-gray-500 mt-1">What has momentum into the close?</p>
      </div>

      <div className="flex items-center gap-4">
        {data && <SourceTag source={data.source ?? 'Finviz'} lastUpdated={data.lastUpdated} />}
        {loading && <span className="text-gray-500 text-sm">Loading...</span>}
      </div>

      <div className="text-xs text-gray-600 p-3 rounded-2xl bg-[#111111] border border-[#1e1e1e]">
        Filter: new high of day OR RVOL &gt; {powerThreshold.toFixed(2)} OR change &gt; 2%.
        VWAP reclaim — confirm on TradingView. No GEX or gamma squeeze analysis.
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      {/* Unusual volume cards */}
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
              <UnusualVolumeCard key={q.symbol} q={q} powerThreshold={powerThreshold} />
            ))}
          </div>
          <div className="border-t border-[#1e1e1e] pt-4 mt-4" />
        </section>
      )}

      {candidates.length === 0 && !loading && !data?.sourceError && (
        <div className="text-gray-500 text-sm">No power hour candidates.</div>
      )}

      {/* Main table */}
      {candidates.length > 0 && (
        <section>
          <h2 className="label mb-3">All Power Hour Candidates ({candidates.length})</h2>
          <div className="overflow-x-auto rounded-2xl border border-[#1e1e1e]">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-[#2a2a2a] bg-[#0f0f0f]">
                  <th className="py-2.5 px-3 label">Symbol</th>
                  <th className="py-2.5 px-3 label">Price</th>
                  <th className="py-2.5 px-3 label">% Chg</th>
                  <th className="py-2.5 px-3 label">RVOL</th>
                  <th className="py-2.5 px-3 label">New High</th>
                  <th className="py-2.5 px-3 label">VWAP</th>
                  <th className="py-2.5 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((q, idx) => {
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
                        (q.rvol ?? 0) >= powerThreshold ? 'text-amber-400' : 'text-gray-500'
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
                      <td className="py-2.5 px-3 text-xs text-gray-600">Confirm on TV</td>
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

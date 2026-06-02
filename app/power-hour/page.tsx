'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import TradingViewButton from '@/components/ui/TradingViewButton';
import { useTradeviStore } from '@/store/tradeviStore';
import type { FinvizQuote, FinvizResult } from '@/lib/finviz';

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

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-white">Power Hour</h1>
        <p className="text-gray-500 text-sm mt-0.5">What has momentum into the close?</p>
      </div>

      <div className="flex items-center gap-4">
        {data && <SourceTag source="Finviz Elite" lastUpdated={data.lastUpdated} />}
        {loading && <span className="text-gray-500 text-sm">Loading...</span>}
      </div>

      <div className="text-xs text-gray-600 p-3 rounded bg-[#1a1a1a] border border-[#2a2a2a]">
        Filter: new high of day OR RVOL &gt; {powerThreshold.toFixed(2)} OR change &gt; 2%.
        VWAP reclaim -- confirm on TradingView. No GEX or gamma squeeze analysis.
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      {candidates.length === 0 && !loading && !data?.sourceError && (
        <div className="text-gray-500 text-sm">No power hour candidates.</div>
      )}

      {candidates.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-gray-500 border-b border-[#2a2a2a]">
                <th className="py-2 pr-4">Symbol</th>
                <th className="py-2 pr-4">Price</th>
                <th className="py-2 pr-4">% Chg</th>
                <th className="py-2 pr-4">RVOL</th>
                <th className="py-2 pr-4">New High</th>
                <th className="py-2 pr-4">VWAP reclaim</th>
                <th className="py-2">Chart</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((q) => (
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
                    (q.rvol ?? 0) >= powerThreshold ? 'text-green-400' : 'text-gray-400'
                  }`}>
                    {q.rvol !== null ? q.rvol.toFixed(2) : '--'}
                  </td>
                  <td className="py-2 pr-4">
                    {q.newHighDay ? <span className="text-green-500">Y</span> : <span className="text-gray-600">N</span>}
                  </td>
                  <td className="py-2 pr-4 text-xs text-gray-500">Confirm on TradingView</td>
                  <td className="py-2">
                    <TradingViewButton symbol={q.symbol} label="Chart" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

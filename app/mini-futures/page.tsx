'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import type { FinvizFuture, FinvizResult } from '@/lib/finviz';

function DirectionBadge({ direction }: { direction: 'up' | 'down' | 'flat' | null }) {
  if (direction === 'up') return <span className="text-green-400 font-bold">▲ Up</span>;
  if (direction === 'down') return <span className="text-red-400 font-bold">▼ Down</span>;
  if (direction === 'flat') return <span className="text-gray-400">= Flat</span>;
  return <span className="text-gray-600">--</span>;
}

export default function MiniFuturesPage() {
  const [data, setData] = useState<FinvizResult<FinvizFuture> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch('/api/finviz/futures');
        const json = await res.json();
        setData(json);
      } catch {
        setData({ data: [], sourceError: 'Fetch failed', lastUpdated: new Date().toISOString() });
      }
      setLoading(false);
    }
    load();
  }, []);

  const futures = data?.data ?? [];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-white">Mini Futures</h1>
        <p className="text-gray-500 text-sm mt-0.5">Is the futures complex risk-on or risk-off?</p>
      </div>

      <div className="flex items-center gap-4">
        {data && <SourceTag source={data.source ?? 'Finviz'} lastUpdated={data.lastUpdated} />}
        {loading && <span className="text-gray-500 text-sm">Loading...</span>}
      </div>

      <div className="text-xs text-gray-600 p-3 rounded bg-[#1a1a1a] border border-[#2a2a2a]">
        This is a bias panel only. Execution is in your prop platform. Only futures present in
        the Finviz data are shown -- missing symbols are omitted, not stubbed.
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      {futures.length === 0 && !loading && !data?.sourceError && (
        <div className="text-gray-500 text-sm">No futures data available from Finviz.</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {futures.map((f) => (
          <div key={f.symbol} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-white font-bold font-mono">{f.symbol}</span>
              <DirectionBadge direction={f.direction} />
            </div>
            <div className="text-xs text-gray-500">{f.name}</div>
            <div className="flex items-center gap-3 text-sm font-mono">
              <span className="text-gray-200">
                {f.price !== null ? f.price.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '--'}
              </span>
              <span className={
                f.changePercent !== null && f.changePercent >= 0 ? 'text-green-400' : 'text-red-400'
              }>
                {f.changePercent !== null
                  ? `${f.changePercent >= 0 ? '+' : ''}${f.changePercent.toFixed(2)}%`
                  : '--'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

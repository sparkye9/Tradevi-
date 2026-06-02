'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import type { FinvizFuture, FinvizResult } from '@/lib/finviz';

function FutureCard({ f }: { f: FinvizFuture }) {
  const isUp = f.direction === 'up';
  const isDown = f.direction === 'down';
  const borderColor = isUp
    ? 'border-emerald-500/30 hover:border-emerald-500/60'
    : isDown
    ? 'border-red-500/30 hover:border-red-500/60'
    : 'border-[#2a2a2a] hover:border-[#3a3a3a]';
  const chgColor = isUp ? 'text-emerald-400' : isDown ? 'text-red-400' : 'text-gray-500';
  const arrow = isUp ? '▲' : isDown ? '▼' : '=';

  return (
    <div className={`bg-[#111111] border rounded-2xl p-5 flex flex-col gap-3 transition-all hover:bg-[#161616] ${borderColor}`}>
      <div className="flex items-center justify-between">
        <span className="text-white font-bold font-mono text-2xl">{f.symbol}</span>
        <span className={`text-2xl font-bold ${chgColor}`}>{arrow}</span>
      </div>
      <div className="text-xs text-gray-600 truncate">{f.name}</div>
      <div className="flex items-center gap-3">
        <span className="text-white font-mono font-semibold text-lg">
          {f.price !== null ? f.price.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '--'}
        </span>
        <span className={`font-mono font-semibold text-base ${chgColor}`}>
          {f.changePercent !== null
            ? `${f.changePercent >= 0 ? '+' : ''}${f.changePercent.toFixed(2)}%`
            : '--'}
        </span>
      </div>
    </div>
  );
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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Mini Futures</h1>
        <p className="text-sm text-gray-500 mt-1">Is the futures complex risk-on or risk-off?</p>
      </div>

      <div className="flex items-center gap-4">
        {data && <SourceTag source={data.source ?? 'Finviz'} lastUpdated={data.lastUpdated} />}
        {loading && <span className="text-gray-500 text-sm">Loading...</span>}
      </div>

      <div className="text-xs text-gray-600 p-3 rounded-2xl bg-[#111111] border border-[#1e1e1e]">
        Bias panel only. Execution is in your prop platform. Only futures present in
        Finviz data are shown — missing symbols are omitted, not stubbed.
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      {futures.length === 0 && !loading && !data?.sourceError && (
        <div className="text-gray-500 text-sm">No futures data available from Finviz.</div>
      )}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0,1,2,3,4].map((i) => (
            <div key={i} className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 animate-pulse">
              <div className="h-8 w-16 bg-[#222] rounded mb-3" />
              <div className="h-3 w-24 bg-[#1a1a1a] rounded mb-3" />
              <div className="h-6 w-28 bg-[#222] rounded" />
            </div>
          ))}
        </div>
      )}

      {futures.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {futures.map((f) => (
            <FutureCard key={f.symbol} f={f} />
          ))}
        </div>
      )}
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import type { FinvizFuture, FinvizResult } from '@/lib/finviz';

const PREMARKET_SYMBOLS = ['ES', 'NQ', 'NKD'];

function DirectionBadge({ direction }: { direction: 'up' | 'down' | 'flat' | null }) {
  if (direction === 'up') return <span className="text-green-400 font-bold text-lg">▲</span>;
  if (direction === 'down') return <span className="text-red-400 font-bold text-lg">▼</span>;
  if (direction === 'flat') return <span className="text-gray-400 font-bold text-lg">=</span>;
  return <span className="text-gray-600">--</span>;
}

export default function FuturesBiasPage() {
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

  const futures = (data?.data ?? []).filter((f) => PREMARKET_SYMBOLS.includes(f.symbol));

  const upCount = futures.filter((f) => f.direction === 'up').length;
  const downCount = futures.filter((f) => f.direction === 'down').length;
  let overallBias: 'Bullish lean' | 'Bearish lean' | 'Mixed' = 'Mixed';
  if (upCount > downCount && upCount >= 2) overallBias = 'Bullish lean';
  if (downCount > upCount && downCount >= 2) overallBias = 'Bearish lean';

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-white">Futures Bias</h1>
        <p className="text-gray-500 text-sm mt-0.5">What is the overnight lean before the open?</p>
      </div>

      <div className="flex items-center gap-4">
        {data && <SourceTag source={data.source ?? 'Finviz'} lastUpdated={data.lastUpdated} />}
        {loading && <span className="text-gray-500 text-sm">Loading...</span>}
      </div>

      <div className="text-xs text-gray-600 p-3 rounded bg-[#1a1a1a] border border-[#2a2a2a]">
        Use to inform SPY and QQQ ORB direction bias only. This is not a signal to trade futures.
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      {futures.length > 0 && (
        <div className={`p-4 rounded-lg border text-lg font-bold ${
          overallBias === 'Bullish lean'
            ? 'bg-green-500/10 border-green-500/30 text-green-400'
            : overallBias === 'Bearish lean'
            ? 'bg-red-500/10 border-red-500/30 text-red-400'
            : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
        }`}>
          {overallBias}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {futures.length === 0 && !loading && !data?.sourceError ? (
          <div className="text-gray-500 text-sm col-span-3">
            ES, NQ, NKD not found in Finviz data.
          </div>
        ) : (
          futures.map((f) => (
            <div key={f.symbol} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white font-bold font-mono text-base">{f.symbol}</div>
                  <div className="text-xs text-gray-500">{f.name}</div>
                </div>
                <DirectionBadge direction={f.direction} />
              </div>
              <div className="font-mono text-sm">
                <span className="text-gray-200">
                  {f.price !== null
                    ? f.price.toLocaleString('en-US', { minimumFractionDigits: 2 })
                    : '--'}
                </span>
                <span className={`ml-2 ${
                  (f.changePercent ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {f.changePercent !== null
                    ? `${f.changePercent >= 0 ? '+' : ''}${f.changePercent.toFixed(2)}%`
                    : '--'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

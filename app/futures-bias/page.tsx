'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import type { FinvizFuture, FinvizResult } from '@/lib/finviz';

const PREMARKET_SYMBOLS = ['ES', 'NQ', 'NKD'];

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
        <div>
          <div className="text-white font-bold font-mono text-2xl">{f.symbol}</div>
          <div className="text-xs text-gray-600 mt-0.5">{f.name}</div>
        </div>
        <span className={`text-3xl font-bold ${chgColor}`}>{arrow}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-white font-mono font-semibold text-lg">
          {f.price !== null
            ? f.price.toLocaleString('en-US', { minimumFractionDigits: 2 })
            : '--'}
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

  const biasBorder =
    overallBias === 'Bullish lean'
      ? 'border-emerald-500/30 bg-emerald-500/10'
      : overallBias === 'Bearish lean'
      ? 'border-red-500/30 bg-red-500/10'
      : 'border-amber-500/30 bg-amber-500/10';
  const biasText =
    overallBias === 'Bullish lean' ? 'text-emerald-400' :
    overallBias === 'Bearish lean' ? 'text-red-400' : 'text-amber-400';
  const biasIcon =
    overallBias === 'Bullish lean' ? '▲' :
    overallBias === 'Bearish lean' ? '▼' : '◆';

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Futures Bias</h1>
        <p className="text-sm text-gray-500 mt-1">What is the overnight lean before the open?</p>
      </div>

      <div className="flex items-center gap-4">
        {data && <SourceTag source={data.source ?? 'Finviz'} lastUpdated={data.lastUpdated} />}
        {loading && <span className="text-gray-500 text-sm">Loading...</span>}
      </div>

      <div className="text-xs text-gray-600 p-3 rounded-2xl bg-[#111111] border border-[#1e1e1e]">
        Use to inform SPY and QQQ ORB direction bias only. This is not a signal to trade futures.
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      {/* Overall bias pill */}
      {futures.length > 0 && (
        <div className={`border rounded-2xl p-5 flex items-center gap-3 ${biasBorder}`}>
          <span className={`text-3xl font-bold ${biasText}`}>{biasIcon}</span>
          <div>
            <div className={`text-xl font-bold font-mono ${biasText}`}>{overallBias}</div>
            <div className="text-xs text-gray-500 mt-0.5">{upCount} up · {downCount} down of {futures.length} tracked</div>
          </div>
        </div>
      )}

      {/* Future cards */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[0,1,2].map((i) => (
            <div key={i} className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 animate-pulse">
              <div className="h-8 w-16 bg-[#222] rounded mb-2" />
              <div className="h-3 w-20 bg-[#1a1a1a] rounded mb-3" />
              <div className="h-6 w-28 bg-[#222] rounded" />
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {futures.length === 0 && !loading && !data?.sourceError ? (
          <div className="text-gray-500 text-sm col-span-3">
            ES, NQ, NKD not found in Finviz data.
          </div>
        ) : (
          futures.map((f) => (
            <FutureCard key={f.symbol} f={f} />
          ))
        )}
      </div>
    </div>
  );
}

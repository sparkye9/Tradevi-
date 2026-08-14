'use client';
import { useEffect, useState } from 'react';
import PremiumGate from '@/components/premium/PremiumGate';
import SourceTag from '@/components/ui/SourceTag';
import type { TrendBiasStackResult, Timeframe, Bias } from '@/lib/trendBias';

const INSTRUMENTS = ['MNQ', 'MES', 'MYM', 'GC'];
const TIMEFRAMES: Timeframe[] = ['Weekly', 'Daily', '4H'];

function BiasPill({ bias }: { bias: Bias }) {
  const styles: Record<Bias, string> = {
    up: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    down: 'bg-red-500/20 text-red-400 border-red-500/40',
    range: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  };
  const icon: Record<Bias, string> = { up: '▲', down: '▼', range: '◆' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold border w-fit ${styles[bias]}`}>
      <span>{icon[bias]}</span>
      {bias.toUpperCase()}
    </span>
  );
}

function TrendBiasContent() {
  const [instrument, setInstrument] = useState('MNQ');
  const [data, setData] = useState<TrendBiasStackResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/trend-bias?instrument=${instrument}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? 'Trend bias engine failed');
          setData(null);
        } else {
          setData(json);
        }
      } catch {
        if (!cancelled) setError('Fetch failed');
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [instrument]);

  const alignmentColor = data?.alignment.startsWith('STACKED LONG')
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    : data?.alignment.startsWith('STACKED SHORT')
    ? 'border-red-500/30 bg-red-500/10 text-red-300'
    : data?.alignment.startsWith('CONFLICTING')
    ? 'border-gray-500/30 bg-gray-500/10 text-gray-300'
    : 'border-amber-500/30 bg-amber-500/10 text-amber-300';

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Trend Bias Stack</h1>
        <p className="text-sm text-gray-500 mt-1">Weekly / Daily / 4H structure read — gates swing conviction.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-full overflow-hidden border border-[#2a2a2a] bg-[#0d0d0d]">
          {INSTRUMENTS.map((inst) => (
            <button
              key={inst}
              onClick={() => setInstrument(inst)}
              className={`px-4 py-1.5 text-xs font-semibold transition-all rounded-full ${
                instrument === inst
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {inst}
            </button>
          ))}
        </div>
        {data && <SourceTag source={`Yahoo Finance (${data.dataSymbol})`} lastUpdated={data.asOf} />}
        {loading && <span className="text-gray-500 text-sm">Loading...</span>}
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-2xl p-4">{error}</div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TIMEFRAMES.map((tf) => (
              <div key={tf} className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-4 flex flex-col gap-2">
                <div className="text-xs text-gray-500 uppercase tracking-widest">{tf}</div>
                <BiasPill bias={data.reads[tf].bias} />
                <div className="text-xs text-gray-600">{data.reads[tf].reason}</div>
              </div>
            ))}
          </div>

          <div className={`border rounded-2xl p-5 ${alignmentColor}`}>
            <div className="text-xs uppercase tracking-widest opacity-70 mb-1">Alignment</div>
            <div className="font-bold">{data.alignment}</div>
          </div>
        </>
      )}

      <div className="text-xs text-gray-600 p-3 rounded-2xl bg-[#111111] border border-[#1e1e1e]">
        Structure-based (higher-high/higher-low), not moving-average based. Validate against your TradingView
        ICT/SMC structure before trusting a fresh flip. Not a signal to trade — confirm manually.
      </div>
    </div>
  );
}

export default function TrendBiasPage() {
  return (
    <PremiumGate>
      <TrendBiasContent />
    </PremiumGate>
  );
}

'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import type {
  Bias,
  Conviction,
  StructureLevels,
  SwingAction,
  Timeframe,
  TrendBiasStackResult,
  Zone,
} from '@/lib/trendBias';

const INSTRUMENTS = ['MNQ', 'MES', 'MYM', 'M2K', 'GC'] as const;
const TIMEFRAMES: Timeframe[] = ['Weekly', 'Daily', '4H'];

function fmt(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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

function ZonePill({ zone }: { zone: Zone }) {
  const styles: Record<Zone, string> = {
    discount: 'text-emerald-400',
    premium: 'text-red-400',
    equilibrium: 'text-amber-300',
    unknown: 'text-gray-500',
  };
  return <span className={`text-xs font-semibold uppercase tracking-widest ${styles[zone]}`}>{zone}</span>;
}

function ActionBanner({
  action,
  conviction,
  headline,
}: {
  action: SwingAction;
  conviction: Conviction;
  headline: string;
}) {
  const wrap: Record<SwingAction, string> = {
    LOOK_LONG: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    LOOK_SHORT: 'border-red-500/30 bg-red-500/10 text-red-300',
    STAND_DOWN: 'border-gray-500/30 bg-gray-500/10 text-gray-300',
  };
  return (
    <div className={`border rounded-2xl p-5 ${wrap[action]}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <div className="text-xs uppercase tracking-widest opacity-70">Swing suggestion</div>
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">{conviction} conviction</span>
      </div>
      <div className="font-bold text-base">{headline}</div>
    </div>
  );
}

function LevelRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs font-mono">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-200">{value}</span>
    </div>
  );
}

function TimeframeCard({ tf, data }: { tf: Timeframe; data: TrendBiasStackResult }) {
  const read = data.reads[tf];
  const levels: StructureLevels = data.levels[tf];
  return (
    <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500 uppercase tracking-widest">{tf}</div>
        <ZonePill zone={levels.zone} />
      </div>
      <BiasPill bias={read.bias} />
      <div className="text-xs text-gray-600">{read.reason}</div>
      <div className="space-y-1.5 pt-1 border-t border-[#1e1e1e]">
        <LevelRow label="Swing high" value={fmt(levels.lastSwingHigh)} />
        <LevelRow label="Equilibrium" value={fmt(levels.equilibrium)} />
        <LevelRow label="Swing low" value={fmt(levels.lastSwingLow)} />
        <LevelRow label="Invalidation" value={fmt(levels.invalidation)} />
      </div>
    </div>
  );
}

function TrendBiasContent() {
  const [instrument, setInstrument] = useState<(typeof INSTRUMENTS)[number]>('MNQ');
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
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Trend Bias Stack</h1>
        <p className="text-sm text-gray-500 mt-1">
          Weekly / Daily / 4H structure — then a gated swing suggestion. Not a moving-average stack.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-full overflow-hidden border border-[#2a2a2a] bg-[#0d0d0d]">
          {INSTRUMENTS.map((inst) => (
            <button
              key={inst}
              onClick={() => setInstrument(inst)}
              className={`px-3.5 py-1.5 text-xs font-semibold transition-all ${
                instrument === inst
                  ? 'bg-emerald-500/20 text-emerald-400'
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

      {data && (
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-600">Last price</div>
            <div className="text-2xl font-mono font-bold text-white">{fmt(data.lastPrice)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-600">Daily zone</div>
            <div className="text-sm font-semibold text-gray-200 capitalize">{data.levels.Daily.zone}</div>
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-2xl p-4">{error}</div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TIMEFRAMES.map((tf) => (
              <TimeframeCard key={tf} tf={tf} data={data} />
            ))}
          </div>

          <div className={`border rounded-2xl p-5 ${alignmentColor}`}>
            <div className="text-xs uppercase tracking-widest opacity-70 mb-1">Alignment</div>
            <div className="font-bold">{data.alignment}</div>
          </div>

          <ActionBanner
            action={data.suggestion.action}
            conviction={data.suggestion.conviction}
            headline={data.suggestion.headline}
          />

          <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-3">
            <div className="text-xs uppercase tracking-widest text-gray-500">Today&apos;s playbook</div>
            <ol className="space-y-2">
              {data.suggestion.playbook.map((line) => (
                <li key={line} className="text-sm text-gray-300 leading-relaxed pl-1">
                  • {line}
                </li>
              ))}
            </ol>
          </div>
        </>
      )}

      <div className="text-xs text-gray-600 p-3 rounded-2xl bg-[#111111] border border-[#1e1e1e]">
        Structure-based (higher-high/higher-low), not moving-average based. Daily is the dealing range;
        4H is the entry timeframe. Validate against your TradingView ICT/SMC structure before trusting a
        fresh flip. Not a signal to trade — confirm manually. Options can go to zero.
      </div>
    </div>
  );
}

// Login + active subscription are already enforced by middleware.ts for
// every route except / , /login, /signup, /subscribe — no gate needed here.
export default function TrendBiasPage() {
  return <TrendBiasContent />;
}

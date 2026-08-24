'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import TradingViewButton from '@/components/ui/TradingViewButton';
import SetupLevelsCard from '@/components/futures/SetupLevelsCard';
import type {
  Bias,
  QualityLabel,
  StructureLevels,
  Timeframe,
  TrendBiasStackResult,
  Zone,
} from '@/lib/trendBias';

const REFRESH_MS = 10 * 60 * 1000;

const INSTRUMENTS = ['MNQ', 'MES', 'MYM', 'M2K', 'GC'] as const;
const TIMEFRAMES: Timeframe[] = ['Weekly', 'Daily', '4H'];

const TV_SYMBOL: Record<(typeof INSTRUMENTS)[number], string> = {
  MNQ: 'MNQ1!',
  MES: 'MES1!',
  MYM: 'MYM1!',
  M2K: 'M2K1!',
  GC: 'GC1!',
};

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

function QualityBanner({ data }: { data: TrendBiasStackResult }) {
  const q = data.quality;
  const wrap: Record<QualityLabel, string> = {
    TRADE:
      data.suggestion.action === 'LOOK_SHORT'
        ? 'border-red-500/30 bg-red-500/10 text-red-300'
        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    WAIT: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    NO_TRADE: 'border-gray-500/30 bg-[#141414] text-gray-200',
  };
  const tag = q.label === 'TRADE' ? data.suggestion.action.replace('_', ' ') : 'NO TRADE';

  return (
    <div className={`border rounded-2xl p-5 ${wrap[q.label]}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest opacity-70 mb-1">Workstation read</div>
          <div className="text-2xl font-black tracking-tight">{tag}</div>
          <div className="font-semibold mt-1">{q.headline}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest opacity-70">Quality</div>
          <div className="text-3xl font-mono font-black">{q.score}</div>
          <div className="text-[10px] opacity-70">/ 100</div>
        </div>
      </div>
      <ul className="mt-3 space-y-1">
        {q.reasons.map((line) => (
          <li key={line} className="text-xs opacity-80">
            • {line}
          </li>
        ))}
      </ul>
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

export default function TrendBiasStack() {
  const [instrument, setInstrument] = useState<(typeof INSTRUMENTS)[number]>('MNQ');
  const [data, setData] = useState<TrendBiasStackResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(isRefresh: boolean) {
      if (!isRefresh) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await fetch(`/api/trend-bias?instrument=${instrument}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? 'Trend bias engine failed');
          if (!isRefresh) setData(null);
        } else {
          setData(json);
          setError(null);
        }
      } catch {
        if (!cancelled) setError('Fetch failed');
      }
      if (!cancelled) setLoading(false);
    }
    load(false);
    const id = setInterval(() => load(true), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [instrument]);

  return (
    <div className="space-y-6">
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
        <TradingViewButton symbol={TV_SYMBOL[instrument]} label={`Confirm ${instrument} on TradingView`} />
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
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-600">Daily invalidation</div>
            <div className="text-sm font-mono text-gray-200">{fmt(data.levels.Daily.invalidation)}</div>
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-2xl p-4">{error}</div>
      )}

      {data && (
        <>
          <QualityBanner data={data} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <SetupLevelsCard
              title="Swing setup"
              subtitle="Daily dealing range — entry, stop, TP1, TP2 from swing high / EQ / swing low."
              setup={data.swingSetup}
            />
            {data.intraday ? (
              <SetupLevelsCard
                title="Intraday setup · 15m"
                subtitle={`15-minute HH/HL. Refreshes every ${data.intraday.refreshMinutes} minutes. Delayed Yahoo — not a live feed.`}
                setup={data.intraday.setup}
              />
            ) : (
              <div className="border border-[#2a2a2a] bg-[#111111] rounded-2xl p-5">
                <div className="text-[10px] uppercase tracking-widest text-gray-500">Intraday setup · 15m</div>
                <p className="text-sm text-gray-400 mt-2">
                  15-minute candles were not available just now. The swing map above still stands. This card
                  retries every 10 minutes.
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TIMEFRAMES.map((tf) => (
              <TimeframeCard key={tf} tf={tf} data={data} />
            ))}
          </div>

          <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-3">
            <div className="text-xs uppercase tracking-widest text-gray-500">Playbook</div>
            <ol className="space-y-2">
              {data.suggestion.playbook.map((line) => (
                <li key={line} className="text-sm text-gray-300 leading-relaxed pl-1">
                  • {line}
                </li>
              ))}
            </ol>
          </div>

          <div className="text-xs text-gray-500 p-4 rounded-2xl bg-[#111111] border border-[#1e1e1e] space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-600">What this page does not do</div>
            <ul className="space-y-1">
              {data.quality.missing.map((line) => (
                <li key={line}>• {line}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

'use client';
import { friendlyDataError } from '@/lib/friendlyError';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import TradingViewButton from '@/components/ui/TradingViewButton';
import SetupLevelsCard from '@/components/futures/SetupLevelsCard';
import type {
  Bias,
  StructureLevels,
  Timeframe,
  TrendBiasStackResult,
  Zone,
} from '@/lib/trendBias';
import type { Grade, ReadinessResult, ReadinessStatus } from '@/lib/readiness';
import { MARKET_UNIVERSE } from '@/lib/marketUniverse';

const REFRESH_MS = 10 * 60 * 1000;

const INSTRUMENTS = MARKET_UNIVERSE.map((u) => u.readinessInstrument);
const TIMEFRAMES: Timeframe[] = ['Weekly', 'Daily', '4H'];

const TV_SYMBOL: Record<string, string> = Object.fromEntries(MARKET_UNIVERSE.map((u) => [u.readinessInstrument, u.tv]));

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

export const STATUS_STYLE: Record<ReadinessStatus, { wrap: string; pill: string; border: string }> = {
  READY: { wrap: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200', pill: 'border-tv-green/40 text-tv-green bg-tv-green/10', border: 'border-tv-green/30' },
  WATCH: { wrap: 'border-amber-500/30 bg-amber-500/10 text-amber-100', pill: 'border-tv-amber/40 text-tv-amber bg-tv-amber/10', border: 'border-tv-amber/30' },
  WAIT: { wrap: 'border-gray-500/30 bg-[#141414] text-gray-200', pill: 'border-tv-border text-tv-muted bg-white/5', border: 'border-tv-border' },
};

export function GradePill({ grade, score, status }: { grade: Grade; score: number; status: ReadinessStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs font-bold ${STATUS_STYLE[status].pill}`}>
      <span>{grade}</span>
      <span className="opacity-70">{score}</span>
    </span>
  );
}

/** WAIT / WATCH reason: the blocking gate, else the top two failed conditions. */
export function readinessReason(r: ReadinessResult): string[] {
  if (r.blocking_gate) return [r.blocking_gate];
  return r.failed.slice(0, 2);
}

function ReadinessBanner({ data }: { data: TrendBiasStackResult }) {
  const r = data.readiness;
  const style = STATUS_STYLE[r.status];
  const side = r.side === 'long' ? 'LONG' : r.side === 'short' ? 'SHORT' : null;
  const statusWord = r.status === 'READY' ? 'READY' : r.status === 'WATCH' ? 'WATCH' : 'WAIT';
  const reasons = readinessReason(r);

  return (
    <div className={`border rounded-2xl p-5 ${style.wrap}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-widest opacity-70 mb-1">Workstation read</div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-2xl font-black tracking-tight">
              {statusWord}
              {side && r.status !== 'WAIT' && <span className="opacity-80"> · {side}</span>}
            </div>
            <GradePill grade={r.grade} score={r.score} status={r.status} />
          </div>
          <div className="font-semibold mt-1 text-sm">{r.headline}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest opacity-70">Grade · Score</div>
          <div className="text-3xl font-mono font-black">
            {r.grade} <span className="text-xl opacity-80">{r.score}</span>
          </div>
          <div className="text-[10px] opacity-70">A ≥ 75 · B 60–74 · C &lt; 60</div>
        </div>
      </div>

      {r.status !== 'READY' && reasons.length > 0 && (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-[10px] uppercase tracking-widest opacity-70 mb-1">
            {r.blocking_gate ? 'Blocked by a hard gate' : r.status === 'WATCH' ? 'Why watch, not ready' : 'Why wait'}
          </div>
          <ul className="space-y-1">
            {reasons.map((line) => (
              <li key={line} className="text-sm">
                • {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {r.gates.map((g) => (
          <span
            key={g.name}
            title={g.detail}
            className={`pill ${g.passed ? 'border-tv-green/30 text-tv-green bg-tv-green/5' : 'border-tv-red/40 text-tv-red bg-tv-red/10'}`}
          >
            {g.passed ? '✓' : '✕'} {g.name}
          </span>
        ))}
        <span className="pill border-tv-border text-tv-muted" title="Age of the newest bar used for the live price">
          data {r.data_age_minutes == null ? 'unavailable' : `${r.data_age_minutes} min old`}
        </span>
      </div>

      <details className="mt-3 group">
        <summary className="cursor-pointer select-none text-xs opacity-70 hover:opacity-100">
          Score breakdown ({r.passed.length} passed · {r.failed.length} short)
        </summary>
        <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
          {r.components.map((c) => (
            <li key={c.key} className="flex items-start gap-2 text-xs">
              <span className={`font-mono shrink-0 w-12 text-right ${c.state === 'passed' ? 'text-tv-green' : c.state === 'partial' ? 'text-tv-amber' : 'text-tv-muted'}`}>
                {c.points}/{c.max}
              </span>
              <span className={c.state === 'failed' ? 'opacity-60' : ''}>{c.label}</span>
            </li>
          ))}
        </ul>
      </details>
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

export default function TrendBiasStack({
  instrument: controlled,
  onInstrumentChange,
}: {
  /** Optional controlled instrument (the readiness board drives this on the Futures page). */
  instrument?: string;
  onInstrumentChange?: (instrument: string) => void;
} = {}) {
  const [internal, setInternal] = useState<string>('MNQ');
  const instrument = controlled ?? internal;
  const setInstrument = (inst: string) => {
    setInternal(inst);
    onInstrumentChange?.(inst);
  };
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
        <div className="flex flex-wrap rounded-2xl overflow-hidden border border-[#2a2a2a] bg-[#0d0d0d]">
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
        <TradingViewButton symbol={TV_SYMBOL[instrument] ?? `${instrument}1!`} label={`Confirm ${instrument} on TradingView`} />
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
        <div className="text-sm text-gray-300 bg-tv-amber/5 border border-tv-amber/20 rounded-2xl p-4" title={error}>{friendlyDataError(error)}</div>
      )}

      {data && (
        <>
          <ReadinessBanner data={data} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <SetupLevelsCard
              title="Swing setup"
              subtitle="Daily dealing range — entry, stop, TP1, TP2 from swing high / EQ / swing low."
              setup={data.swingSetup}
            />
            {data.intraday ? (
              <SetupLevelsCard
                title="Intraday map · 15m · Confirm on TradingView"
                subtitle={`15-minute HH/HL on delayed data (about 15–20 min behind). Refreshes every ${data.intraday.refreshMinutes} minutes. Levels are a map, not a trigger — confirm every one on your chart.`}
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

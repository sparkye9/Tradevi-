'use client';
import { useEffect, useState, useCallback } from 'react';

interface StrategyStats {
  label: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  expectancyR: number;
  profitFactor: number | null;
  totalR: number;
  maxDrawdownR: number;
  avgWinR: number;
  avgLossR: number;
}
interface BTResult {
  instrument: string;
  dataSymbol: string;
  bars: number;
  fromDate: string | null;
  toDate: string | null;
  signalsGenerated: number;
  ordersFilled: number;
  fillRate: number;
  tp1Strategy: StrategyStats;
  tp2Strategy: StrategyStats;
  notes: string[];
  error?: string;
}
interface Payload {
  results: BTResult[];
  period: string;
  weeklyFilter: boolean;
  source: string;
  lastUpdated: string;
  error?: string;
}

function rColor(r: number) {
  return r > 0.05 ? 'text-emerald-400' : r < -0.05 ? 'text-red-400' : 'text-gray-400';
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-gray-600">{k}</span>
      <span className={`font-mono text-sm font-semibold ${tone ?? 'text-gray-200'}`}>{v}</span>
    </div>
  );
}

function StrategyBlock({ s }: { s: StrategyStats }) {
  return (
    <div className="rounded-xl border border-tv-border bg-[#0d1017] p-3">
      <div className="text-xs font-bold text-tv-purple mb-2.5">{s.label}</div>
      {s.trades === 0 ? (
        <div className="text-xs text-gray-600">No filled trades.</div>
      ) : (
        <div className="grid grid-cols-3 gap-y-3 gap-x-2">
          <Stat k="Trades" v={String(s.trades)} />
          <Stat k="Win rate" v={`${s.winRate}%`} tone={s.winRate >= 50 ? 'text-emerald-400' : 'text-gray-200'} />
          <Stat k="Expectancy" v={`${s.expectancyR >= 0 ? '+' : ''}${s.expectancyR}R`} tone={rColor(s.expectancyR)} />
          <Stat k="Total" v={`${s.totalR >= 0 ? '+' : ''}${s.totalR}R`} tone={rColor(s.totalR)} />
          <Stat k="Profit factor" v={s.profitFactor === null ? '∞' : String(s.profitFactor)} tone={(s.profitFactor ?? 0) >= 1 ? 'text-emerald-400' : 'text-red-400'} />
          <Stat k="Max DD" v={`-${s.maxDrawdownR}R`} tone="text-red-400" />
          <Stat k="Avg win" v={`+${s.avgWinR}R`} tone="text-emerald-400" />
          <Stat k="Avg loss" v={`-${s.avgLossR}R`} tone="text-red-400" />
          <Stat k="W / L" v={`${s.wins} / ${s.losses}`} />
        </div>
      )}
    </div>
  );
}

function ResultCard({ r }: { r: BTResult }) {
  return (
    <div className="rounded-2xl border border-tv-border bg-[#0b0e14] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-white font-black text-lg">{r.instrument}</span>
          <span className="text-gray-600 text-xs font-mono ml-2">{r.dataSymbol}</span>
        </div>
        <div className="text-right text-[10px] text-gray-600 font-mono">
          {r.fromDate} → {r.toDate}<br />{r.bars} daily bars
        </div>
      </div>

      {r.error ? (
        <div className="text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg p-2">{r.error}</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 text-xs">
            <span className="text-gray-500">Signals <span className="text-gray-200 font-mono font-semibold">{r.signalsGenerated}</span></span>
            <span className="text-gray-500">Filled <span className="text-gray-200 font-mono font-semibold">{r.ordersFilled}</span></span>
            <span className="text-gray-500">Fill rate <span className="text-gray-200 font-mono font-semibold">{r.fillRate}%</span></span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StrategyBlock s={r.tp1Strategy} />
            <StrategyBlock s={r.tp2Strategy} />
          </div>
        </>
      )}
    </div>
  );
}

export default function BacktestPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekly, setWeekly] = useState(true);

  const load = useCallback(async (wk: boolean) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/futures/backtest?instrument=ALL&period=2y&weekly=${wk ? 'on' : 'off'}`);
      setData(await res.json());
    } catch {
      setData(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(weekly); }, [load, weekly]);

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Swing Engine Backtest</h1>
          <p className="text-xs text-gray-600 mt-0.5">
            Walk-forward replay of the daily dealing-range setups over 2 years of history — no lookahead.
          </p>
        </div>
        <button
          onClick={() => setWeekly((w) => !w)}
          className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
            weekly ? 'bg-tv-purple/15 text-tv-purple border-tv-purple/40' : 'bg-[#1a1a1a] text-gray-500 border-tv-border'
          }`}
        >
          {weekly ? '✓ Weekly filter ON' : 'Weekly filter OFF'}
        </button>
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200/80 leading-relaxed">
        <b>How to read this:</b> results are in <b>R multiples</b> (1R = the entry-to-stop distance).
        Expectancy is average R per trade — positive means an edge. Two exit rules are shown: take everything
        at TP1 (equilibrium) vs. hold for TP2 (opposite swing). Fills are conservative: a bar that spans both
        stop and target counts as a loss. This tests the daily mechanics only — the live app is more selective
        (full Weekly/Daily/4H stack). Not financial advice.
      </div>

      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-56 rounded-2xl border border-tv-border bg-[#0b0e14] animate-pulse" />)}
        </div>
      )}

      {!loading && data?.error && (
        <div className="text-sm text-red-400">{data.error}</div>
      )}

      {!loading && data?.results?.map((r) => <ResultCard key={r.instrument} r={r} />)}

      {!loading && data && (
        <p className="text-[10px] text-gray-700">
          {data.source} · {new Date(data.lastUpdated).toLocaleString()} · cached hourly. Past performance is not indicative of future results.
        </p>
      )}
    </div>
  );
}

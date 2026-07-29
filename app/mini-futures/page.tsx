'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import { computeFuturesBias as computeBias } from '@/lib/futuresBias';
import type { FinvizFuture, FinvizResult } from '@/lib/finviz';

// ─── Instrument card ──────────────────────────────────────────────────────────

const DISPLAY_NAMES: Record<string, string> = {
  GC: 'Gold', OIL: 'Oil', TNX: '10Y Yield', DXY: 'DXY',
};

function InstrumentCard({ f }: { f: FinvizFuture }) {
  const isVix = f.symbol === 'VIX';
  const isTnx = f.symbol === 'TNX';
  const isDxy = f.symbol === 'DXY';

  const isUp   = f.direction === 'up';
  const isDown = f.direction === 'down';

  // VIX, TNX, DXY rising = bearish for equities
  const invertedSentiment = isVix || isTnx || isDxy;
  const bullish = invertedSentiment ? isDown : isUp;
  const bearish = invertedSentiment ? isUp   : isDown;

  const borderColor = bullish ? 'border-emerald-500/30' : bearish ? 'border-red-500/30' : 'border-[#2a2a2a]';
  const chgColor    = bullish ? 'text-emerald-400' : bearish ? 'text-red-400' : 'text-gray-500';
  const lean        = bullish ? 'BULL' : bearish ? 'BEAR' : 'FLAT';
  const leanColor   = bullish
    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    : bearish
    ? 'bg-red-500/20 text-red-400 border-red-500/30'
    : 'bg-[#1e1e1e] text-gray-500 border-[#2a2a2a]';

  const displaySymbol = DISPLAY_NAMES[f.symbol] ?? f.symbol;

  return (
    <div className={`bg-[#111111] border rounded-xl p-3 flex flex-col gap-1.5 transition-all hover:bg-[#161616] ${borderColor}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-white font-bold font-mono text-base leading-tight">{displaySymbol}</div>
          <div className="text-[10px] text-gray-600 truncate max-w-[90px]">{f.name}</div>
        </div>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${leanColor}`}>{lean}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-white font-mono text-xs font-semibold">
          {f.price !== null ? f.price.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '--'}
        </span>
        <span className={`font-mono text-xs font-semibold ${chgColor}`}>
          {f.changePercent !== null ? `${f.changePercent >= 0 ? '+' : ''}${f.changePercent.toFixed(2)}%` : '--'}
        </span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

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
  const read = futures.length > 0 ? computeBias(futures) : null;

  const biasBg =
    read?.bias === 'BULLISH' ? 'border-emerald-500/40 bg-emerald-500/10' :
    read?.bias === 'BEARISH' ? 'border-red-500/40 bg-red-500/10' :
    'border-amber-500/30 bg-amber-500/5';
  const biasColor =
    read?.bias === 'BULLISH' ? 'text-emerald-400' :
    read?.bias === 'BEARISH' ? 'text-red-400' :
    'text-amber-400';
  const confBarColor =
    read?.bias === 'BULLISH' ? 'bg-emerald-500' :
    read?.bias === 'BEARISH' ? 'bg-red-500' :
    'bg-amber-500';

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Futures Guide</h1>
        <p className="text-sm text-gray-500 mt-1">9-factor bias engine — ES · NQ · YM · RTY · VIX · Gold · Oil · 10Y · DXY</p>
      </div>

      <div className="flex items-center gap-4">
        {data && <SourceTag source={data.source ?? 'Yahoo Finance'} lastUpdated={data.lastUpdated} />}
        {loading && <span className="text-gray-500 text-sm animate-pulse">Loading...</span>}
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      {/* ── Bias card ── */}
      {read && (
        <div className={`border rounded-2xl p-5 ${biasBg}`}>
          <div className="flex items-end justify-between mb-3">
            <div>
              <div className={`text-3xl font-black font-mono tracking-tight ${biasColor}`}>
                {read.bias} BIAS
              </div>
              <div className={`text-lg font-bold font-mono mt-0.5 ${biasColor}`}>
                {read.confidence}% Confidence
              </div>
            </div>
            <div className={`text-4xl font-black font-mono ${biasColor}`}>
              {read.bias === 'BULLISH' ? '▲' : read.bias === 'BEARISH' ? '▼' : '◆'}
            </div>
          </div>
          {/* Confidence bar */}
          <div className="w-full bg-[#1a1a1a] rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${confBarColor}`}
              style={{ width: `${read.confidence}%` }}
            />
          </div>
          <div className="text-xs text-gray-600 mt-1.5">Score: {read.score > 0 ? '+' : ''}{read.score}</div>
        </div>
      )}

      {/* ── Instrument grid ── */}
      {loading && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
          {[0,1,2,3,4,5,6,7,8].map((i) => (
            <div key={i} className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-3 animate-pulse h-16" />
          ))}
        </div>
      )}
      {futures.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
          {futures.map((f) => <InstrumentCard key={f.symbol} f={f} />)}
        </div>
      )}

      {/* ── Drivers & Risks ── */}
      {read && (read.drivers.length > 0 || read.risks.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {read.drivers.length > 0 && (
            <div className="bg-[#111111] border border-emerald-500/20 rounded-xl p-4 space-y-2">
              <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Drivers</div>
              {read.drivers.map((d, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="text-emerald-400 shrink-0">✓</span> {d.label}
                </div>
              ))}
            </div>
          )}
          {read.risks.length > 0 && (
            <div className="bg-[#111111] border border-red-500/20 rounded-xl p-4 space-y-2">
              <div className="text-xs font-bold text-red-400 uppercase tracking-widest">Risks</div>
              {read.risks.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="text-amber-400 shrink-0">⚠</span> {r.label}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── VIX environment ── */}
      {read && (
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-4">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">VIX Environment</div>
          <p className="text-sm text-gray-300">{read.vixNote}</p>
        </div>
      )}

      {/* ── Playbook ── */}
      {read && (
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-3">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Today&apos;s Playbook</div>
          <ul className="space-y-2">
            {read.playbook.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                <span className={`mt-0.5 shrink-0 font-bold ${biasColor}`}>→</span>
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-gray-700">
        Bias from overnight futures. Key levels and execution on your prop platform + TradingView.
      </p>
    </div>
  );
}

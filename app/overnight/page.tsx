'use client';
import { useEffect, useState, useCallback } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import TradingViewButton from '@/components/ui/TradingViewButton';
import { useTradeviStore } from '@/store/tradeviStore';

interface Scored {
  symbol: string;
  name: string;
  price: number | null;
  regularPrice?: number | null;
  changePercent: number | null;
  direction: 'PUT' | 'CALL' | 'NONE';
  score: number;
  grade: string;
  reasons: string[];
  sector?: string | null;
}

interface ScanResult {
  session: 'pre-market' | 'regular' | 'after-hours' | 'overnight' | 'closed';
  confirmation: { bias: 'BEARISH' | 'BULLISH' | 'MIXED'; note: string };
  futures: Scored[];
  movers: Scored[];
  source: string;
  sourceError?: string;
  lastUpdated: string;
}

const SESSION_META: Record<ScanResult['session'], { label: string; icon: string; color: string; desc: string }> = {
  'pre-market':  { label: 'Pre-Market',   icon: '🌅', color: 'text-amber-400',   desc: '4:00–9:30am ET · gappers setting up the open' },
  'regular':     { label: 'Regular Hours',icon: '☀️', color: 'text-emerald-400', desc: '9:30am–4:00pm ET · full liquidity' },
  'after-hours': { label: 'After Hours',  icon: '🌆', color: 'text-orange-400',  desc: '4:00–8:00pm ET · earnings & news reactions' },
  'overnight':   { label: 'Overnight',    icon: '🌙', color: 'text-indigo-400',  desc: 'Globex session · futures lead the next open' },
  'closed':      { label: 'Market Closed',icon: '🌑', color: 'text-gray-500',    desc: 'Futures still trade — check overnight bias' },
};

function gradeColor(g: string) {
  return g === 'A+' || g === 'A' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    : g === 'B' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    : 'text-gray-500 bg-[#161616] border-[#222]';
}

function dirColor(d: string) {
  return d === 'PUT' ? 'text-red-400' : d === 'CALL' ? 'text-emerald-400' : 'text-gray-600';
}

function FuturesRow({ f }: { f: Scored }) {
  return (
    <div className="flex items-center gap-3 py-3 px-4 border-b border-[#0f0f0f] hover:bg-white/[0.02] transition-colors">
      <div className="w-20">
        <div className="font-mono font-bold text-white text-sm">{f.symbol}</div>
        <div className="text-[10px] text-gray-600">{f.name}</div>
      </div>
      <div className="w-24 text-right">
        <span className="font-mono text-sm text-gray-300">
          {f.price !== null ? f.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '--'}
        </span>
      </div>
      <div className="w-20 text-right">
        <span className={`font-mono text-sm font-semibold ${
          (f.changePercent ?? 0) < 0 ? 'text-red-400' : (f.changePercent ?? 0) > 0 ? 'text-emerald-400' : 'text-gray-600'
        }`}>
          {f.changePercent !== null ? `${f.changePercent >= 0 ? '+' : ''}${f.changePercent.toFixed(2)}%` : '--'}
        </span>
      </div>
      <div className="w-16 text-center">
        <span className={`font-mono font-bold text-sm ${dirColor(f.direction)}`}>{f.direction}</span>
      </div>
      <div className="flex-1 flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden max-w-[80px]">
          <div className={`h-full rounded-full ${f.score >= 70 ? (f.direction === 'PUT' ? 'bg-red-500' : 'bg-emerald-500') : 'bg-gray-600'}`} style={{ width: `${f.score}%` }} />
        </div>
        <span className="font-mono text-xs text-gray-400 w-6">{f.score}</span>
      </div>
      <span className={`text-xs font-bold px-2 py-0.5 rounded border ${gradeColor(f.grade)} w-12 text-center`}>{f.grade}</span>
    </div>
  );
}

function MoverCard({ m }: { m: Scored }) {
  const isPut = m.direction === 'PUT';
  const border = isPut ? 'border-red-500/20 hover:border-red-500/40' : m.direction === 'CALL' ? 'border-emerald-500/20 hover:border-emerald-500/40' : 'border-[#1e1e1e]';
  return (
    <div className={`bg-[#111111] border ${border} rounded-2xl p-4 flex flex-col gap-3 transition-all`}>
      <div className="flex items-start justify-between">
        <div>
          <span className="text-white font-bold font-mono text-xl">{m.symbol}</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-white font-mono font-semibold text-sm">
              {m.price !== null ? `$${m.price.toFixed(2)}` : '--'}
            </span>
            <span className={`font-mono font-semibold text-sm ${(m.changePercent ?? 0) < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {m.changePercent !== null ? `${m.changePercent >= 0 ? '+' : ''}${m.changePercent.toFixed(2)}%` : '--'}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
            isPut ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
          }`}>{m.direction}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded border ${gradeColor(m.grade)}`}>{m.grade} · {m.score}</span>
        </div>
      </div>
      {m.reasons.length > 0 && (
        <div className="space-y-1">
          {m.reasons.slice(0, 3).map((r, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs">
              <span className={isPut ? 'text-red-400/70' : 'text-emerald-400/70'}>›</span>
              <span className="text-gray-500 leading-snug">{r}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between pt-1 border-t border-[#1e1e1e]">
        {m.regularPrice != null && m.price != null && m.regularPrice !== m.price ? (
          <span className="text-[10px] text-gray-600 font-mono">Reg close ${m.regularPrice.toFixed(2)}</span>
        ) : <span />}
        <TradingViewButton symbol={m.symbol} label="Chart" />
      </div>
    </div>
  );
}

export default function OvernightPage() {
  const tradingMode = useTradeviStore((s) => s.tradingMode);
  const [data, setData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/overnight/scan');
      setData(await res.json());
    } catch {
      setData(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const sessionMeta = data ? SESSION_META[data.session] : null;

  // Mode-aware filtering
  const filterDir = (arr: Scored[]) =>
    tradingMode === 'puts' ? arr.filter((x) => x.direction === 'PUT') : arr;

  const futures = data ? filterDir(data.futures) : [];
  const movers = data ? filterDir(data.movers) : [];

  const confBias = data?.confirmation.bias;
  const confColor = confBias === 'BEARISH' ? 'text-red-400 border-red-500/20 bg-red-500/5'
    : confBias === 'BULLISH' ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5'
    : 'text-amber-400 border-amber-500/20 bg-amber-500/5';

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">24H Scanner</h1>
          <p className="text-xs text-gray-600 mt-0.5">Overnight, pre-market & after-hours setups — trade the sessions before the open</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-1.5 text-xs font-semibold bg-[#1a1a1a] border border-[#2a2a2a] rounded-full text-gray-300 hover:border-emerald-500/30 hover:text-white transition-all disabled:opacity-50"
          >
            {loading ? 'Scanning...' : '↻ Refresh'}
          </button>
          {data && <SourceTag source={data.source} lastUpdated={data.lastUpdated} />}
        </div>
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      {/* Session + confirmation banner */}
      {sessionMeta && (
        <div className={`border rounded-2xl p-4 ${confColor} flex items-center justify-between flex-wrap gap-3`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{sessionMeta.icon}</span>
            <div>
              <div className={`font-bold text-sm ${sessionMeta.color}`}>{sessionMeta.label}</div>
              <div className="text-xs text-gray-500">{sessionMeta.desc}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-600 uppercase tracking-widest">Cross-Market</div>
            <div className="font-black text-sm">{data?.confirmation.bias}</div>
          </div>
        </div>
      )}
      {data && (
        <p className="text-xs text-gray-500 -mt-2 px-1">{data.confirmation.note}</p>
      )}

      {loading && !data && (
        <div className="space-y-3">
          <div className="h-40 bg-[#0d0d0d] border border-[#1e1e1e] rounded-2xl animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[0,1,2].map((i) => <div key={i} className="h-40 bg-[#0d0d0d] border border-[#1e1e1e] rounded-2xl animate-pulse" />)}
          </div>
        </div>
      )}

      {/* Futures — 24h Globex */}
      {!loading && (
        <section className="space-y-3">
          <div className="pb-1 border-b border-[#1e1e1e]">
            <h2 className="text-white font-bold text-base">🌙 Index Futures — 24h Globex</h2>
            <p className="text-xs text-gray-600 mt-0.5">Trade nearly around the clock · overnight change leads the next session</p>
          </div>
          {futures.length === 0 ? (
            <div className="text-center py-8 text-gray-600 text-sm">
              {tradingMode === 'puts' ? 'No bearish futures setups overnight — flip to BOTH to see longs.' : 'No futures data available.'}
            </div>
          ) : (
            <div className="rounded-2xl border border-[#1e1e1e] bg-[#0d0d0d] overflow-hidden">
              <div className="flex items-center gap-3 py-2 px-4 border-b border-[#161616] text-[10px] font-bold text-gray-600 uppercase tracking-widest">
                <span className="w-20">Asset</span>
                <span className="w-24 text-right">Price</span>
                <span className="w-20 text-right">O/N %</span>
                <span className="w-16 text-center">Dir</span>
                <span className="flex-1">Score</span>
                <span className="w-12 text-center">Grade</span>
              </div>
              {futures.map((f) => <FuturesRow key={f.symbol} f={f} />)}
            </div>
          )}
        </section>
      )}

      {/* Extended-hours movers */}
      {!loading && (
        <section className="space-y-3">
          <div className="pb-1 border-b border-[#1e1e1e]">
            <h2 className="text-white font-bold text-base">⚡ Extended-Hours Movers</h2>
            <p className="text-xs text-gray-600 mt-0.5">Stocks gapping in pre-market / after-hours — tradeable before the bell</p>
          </div>
          {movers.length === 0 ? (
            <div className="text-center py-8 text-gray-600 text-sm">
              {tradingMode === 'puts'
                ? 'No bearish extended-hours movers right now — flip to BOTH to see longs.'
                : 'No significant extended-hours movers right now.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {movers.map((m) => <MoverCard key={m.symbol} m={m} />)}
            </div>
          )}
        </section>
      )}

      <p className="text-[10px] text-gray-700 text-center pb-4">
        Overnight scoring uses live Globex + extended-hours data · Confirm liquidity sweep / MSS / FVG on TradingView before entry.
        Extended-hours spreads are wide — use limit orders.
      </p>
    </div>
  );
}

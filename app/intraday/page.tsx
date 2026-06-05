'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import TradingViewButton from '@/components/ui/TradingViewButton';
import { useTradeviStore, MARKET_TICKERS } from '@/store/tradeviStore';
import type { FinvizQuote, FinvizResult } from '@/lib/finviz';
import type { TradierContract, TradierOptionsResult } from '@/lib/tradier';

// ─── SMA arrows ─────────────────────────────────────────────────────────────

function SmaLabel({ q }: { q: FinvizQuote }) {
  const fmt = (rel: 'above' | 'below' | null, label: string) => {
    if (rel === 'above') return <span key={label} className="text-emerald-400">{label}▲</span>;
    if (rel === 'below') return <span key={label} className="text-red-400">{label}▼</span>;
    return <span key={label} className="text-gray-600">{label}?</span>;
  };
  return (
    <div className="flex gap-1 text-xs font-mono">
      {fmt(q.sma20rel, '20')}
      {fmt(q.sma50rel, '50')}
      {fmt(q.sma200rel, '200')}
    </div>
  );
}

// ─── Options panel ────────────────────────────────────────────────────────────

function ContractRow({ c }: { c: TradierContract }) {
  const mid = c.bid !== null && c.ask !== null ? ((c.bid + c.ask) / 2).toFixed(2) : '--';
  const deltaColor = c.delta !== null
    ? c.type === 'call' ? 'text-emerald-400' : 'text-red-400'
    : 'text-gray-500';
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#1e1e1e] last:border-0 text-xs font-mono">
      <div className="flex items-center gap-2">
        <span className={`font-semibold uppercase ${c.type === 'call' ? 'text-emerald-400' : 'text-red-400'}`}>
          {c.type.toUpperCase()}
        </span>
        <span className="text-gray-300">${c.strike}</span>
        <span className="text-gray-600">{c.expiration}</span>
      </div>
      <div className="flex items-center gap-3">
        {c.delta !== null && (
          <span className={deltaColor}>Δ{c.delta.toFixed(2)}</span>
        )}
        {c.iv !== null && (
          <span className="text-gray-500">IV {(c.iv * 100).toFixed(0)}%</span>
        )}
        <span className="text-white font-semibold">${mid}</span>
        {c.openInterest !== null && (
          <span className="text-gray-600">OI {c.openInterest.toLocaleString()}</span>
        )}
      </div>
    </div>
  );
}

function OptionsPanel({ symbol }: { symbol: string }) {
  const [result, setResult] = useState<TradierOptionsResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/tradier/options?symbol=${symbol}`);
        const json = await res.json();
        if (!cancelled) setResult(json);
      } catch {
        if (!cancelled) setResult({ contracts: [], sourceError: 'Fetch failed', source: 'Tradier', lastUpdated: new Date().toISOString() });
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [symbol]);

  if (loading) {
    return (
      <div className="mt-3 pt-3 border-t border-[#1e1e1e]">
        <p className="text-xs text-gray-600 animate-pulse">Loading contracts...</p>
      </div>
    );
  }

  if (result?.sourceError) {
    return (
      <div className="mt-3 pt-3 border-t border-[#1e1e1e]">
        <p className="text-xs text-red-500/70">{result.sourceError}</p>
      </div>
    );
  }

  const calls = (result?.contracts ?? []).filter((c) => c.type === 'call').slice(0, 4);
  const puts = (result?.contracts ?? []).filter((c) => c.type === 'put').slice(0, 4);

  if (calls.length === 0 && puts.length === 0) {
    return (
      <div className="mt-3 pt-3 border-t border-[#1e1e1e]">
        <p className="text-xs text-gray-600">No qualifying contracts found</p>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-[#1e1e1e] space-y-3">
      {calls.length > 0 && (
        <div>
          <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider mb-1">Calls</p>
          {calls.map((c) => <ContractRow key={c.symbol} c={c} />)}
        </div>
      )}
      {puts.length > 0 && (
        <div>
          <p className="text-xs text-red-400 font-semibold uppercase tracking-wider mb-1">Puts</p>
          {puts.map((c) => <ContractRow key={c.symbol} c={c} />)}
        </div>
      )}
      <p className="text-xs text-gray-700">
        {result?.source} · Δ 0.20–0.70 filter
      </p>
    </div>
  );
}

// ─── Candidate card ──────────────────────────────────────────────────────────

function CandidateCard({ q, rvolThreshold }: { q: FinvizQuote; rvolThreshold: number }) {
  const [showOptions, setShowOptions] = useState(false);
  const isUnusual = (q.rvol ?? 0) >= 2;
  const borderClass = isUnusual
    ? 'border-amber-500/40 hover:border-amber-500/70'
    : 'border-[#1e1e1e] hover:border-[#2a2a2a]';

  return (
    <div className={`bg-[#111111] border ${borderClass} rounded-2xl p-4 flex flex-col gap-3 transition-all`}>
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div>
          <span className="text-white font-bold font-mono text-2xl">{q.symbol}</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-white font-mono font-semibold">
              {q.price !== null ? `$${q.price.toFixed(2)}` : '--'}
            </span>
            <span className={`font-mono font-semibold ${(q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {q.changePercent !== null
                ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%`
                : '--'}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          {isUnusual ? (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              🔥 RVOL {q.rvol!.toFixed(2)}
            </span>
          ) : (
            q.rvol !== null && (
              <span className={`text-xs font-mono ${(q.rvol ?? 0) >= rvolThreshold ? 'text-amber-400' : 'text-gray-500'}`}>
                RVOL {q.rvol.toFixed(2)}
              </span>
            )
          )}
          {q.newHighDay && (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              NEW HIGH
            </span>
          )}
        </div>
      </div>

      {/* SMA + gap + group */}
      <div className="flex items-center justify-between">
        <SmaLabel q={q} />
        <div className="flex items-center gap-2">
          {q.gap !== null && Math.abs(q.gap) > 0.5 && (
            <span className={`text-xs font-mono ${q.gap > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              Gap {q.gap > 0 ? '+' : ''}{q.gap.toFixed(2)}%
            </span>
          )}
          {q.groupStrength && (
            <span className={`text-xs font-semibold ${
              q.groupStrength === 'strong' ? 'text-emerald-400' :
              q.groupStrength === 'weak' ? 'text-red-400' : 'text-gray-600'
            }`}>
              {q.groupStrength}
            </span>
          )}
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center justify-between pt-1 border-t border-[#1e1e1e]">
        <button
          onClick={() => setShowOptions((p) => !p)}
          className={`text-xs font-semibold transition-colors px-2.5 py-1 rounded-lg ${
            showOptions
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'text-gray-500 hover:text-gray-300 border border-[#2a2a2a] hover:border-[#3a3a3a]'
          }`}
        >
          {showOptions ? '▼ Contracts' : '▶ Contracts'}
        </button>
        <TradingViewButton symbol={q.symbol} label="Chart" />
      </div>

      {/* Expandable options panel */}
      {showOptions && <OptionsPanel symbol={q.symbol} />}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

function getETSession(): string {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const h = et.getHours();
  if (h >= 20 || h < 2) return 'Asia';
  if (h >= 2 && h < 9) return 'London';
  if (h >= 9 && h < 16) return 'New York';
  return 'After Hours';
}

const CHECKLIST_ITEMS = [
  'Regime confirmed — not in compression',
  'Quality grade B or higher',
  'Not in revenge trade pattern',
];

export default function IntradayPage() {
  const { watchlist, rvolThreshold, setRvolThreshold, scanMode, setScanMode } = useTradeviStore();
  const [data, setData] = useState<FinvizResult<FinvizQuote> | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<Date | null>(null);
  const [checklist, setChecklist] = useState<boolean[]>([false, false, false]);
  const [checklistOpen, setChecklistOpen] = useState(true);

  useEffect(() => {
    setNow(new Date());
    const iv = setInterval(() => setNow(new Date()), 60000);
    const saved = sessionStorage.getItem('intraday-checklist');
    if (saved) setChecklist(JSON.parse(saved));
    return () => clearInterval(iv);
  }, []);

  const session = now ? getETSession() : null;

  function toggleCheck(i: number) {
    const updated = checklist.map((v, idx) => idx === i ? !v : v);
    setChecklist(updated);
    sessionStorage.setItem('intraday-checklist', JSON.stringify(updated));
  }

  const checksPassed = checklist.filter(Boolean).length;

  const tickers = scanMode === 'market' ? MARKET_TICKERS : watchlist;

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/finviz/screener?tickers=${tickers.join(',')}`);
      const json = await res.json();
      setData(json);
    } catch {
      setData({ data: [], sourceError: 'Fetch failed', lastUpdated: new Date().toISOString() });
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [scanMode, watchlist]); // eslint-disable-line

  const allQuotes = data?.data ?? [];

  const intraday = [...allQuotes]
    .filter((q) => (q.rvol ?? 0) >= rvolThreshold || q.newHighDay)
    .sort((a, b) => (b.rvol ?? 0) - (a.rvol ?? 0));

  const unusual = intraday.filter((q) => (q.rvol ?? 0) >= 2);
  const regular = intraday.filter((q) => (q.rvol ?? 0) < 2);

  const sessionColor =
    session === 'New York' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
    session === 'London'   ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' :
    session === 'Asia'     ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' :
                             'bg-gray-500/10 border-gray-500/30 text-gray-400';

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Intraday</h1>
        <p className="text-sm text-gray-500 mt-1">Fast tactical execution. High contrast, high density.</p>
      </div>

      <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl border ${session ? sessionColor : 'bg-[#111111] border-[#1e1e1e]'}`}>
        <div className="w-2 h-2 rounded-full bg-current animate-pulse shrink-0" />
        <span className="font-mono font-bold text-base">{session ?? 'Detecting session...'}</span>
        {session && <span className="text-xs font-semibold opacity-70">Session Active</span>}
        {session === 'After Hours' && <span className="text-xs opacity-50">Market closed</span>}
      </div>

      <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl overflow-hidden">
        <button
          onClick={() => setChecklistOpen((p) => !p)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-all"
        >
          <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Pre-trade Checklist</span>
          <span className="text-gray-600 text-xs">{checklistOpen ? '▲' : '▼'}</span>
        </button>
        {checklistOpen && (
          <div className="px-5 pb-4 space-y-3 border-t border-[#1e1e1e] pt-3">
            {CHECKLIST_ITEMS.map((item, i) => (
              <label key={i} className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={checklist[i]}
                  onChange={() => toggleCheck(i)}
                  className="accent-emerald-500 w-4 h-4"
                />
                <span className={`text-sm transition-colors ${checklist[i] ? 'text-emerald-400 line-through' : 'text-gray-300 group-hover:text-white'}`}>
                  {item}
                </span>
              </label>
            ))}
            <div className={`mt-3 text-sm font-semibold ${checksPassed === 3 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {checksPassed === 3 ? '3/3 checks passed ✓' : `${checksPassed}/3 — review before trading`}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-[#111111] border border-[#1e1e1e] rounded-2xl">
        <div className="flex rounded-full overflow-hidden border border-[#2a2a2a] bg-[#0d0d0d]">
          <button
            onClick={() => setScanMode('watchlist')}
            className={`px-4 py-1.5 text-xs font-semibold transition-all rounded-full ${
              scanMode === 'watchlist'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Watchlist ({watchlist.length})
          </button>
          <button
            onClick={() => setScanMode('market')}
            className={`px-4 py-1.5 text-xs font-semibold transition-all rounded-full ${
              scanMode === 'market'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Market Scan ({MARKET_TICKERS.length})
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500 uppercase tracking-wider font-semibold">RVOL ≥</span>
          <input
            type="number"
            value={rvolThreshold}
            step={0.1} min={0.5} max={10}
            onChange={(e) => setRvolThreshold(parseFloat(e.target.value) || 1.5)}
            className="w-16 bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-emerald-500/50"
          />
        </div>

        <button
          onClick={load}
          disabled={loading}
          className="px-4 py-1.5 text-xs font-semibold bg-[#1a1a1a] border border-[#2a2a2a] rounded-full text-gray-300 hover:border-emerald-500/30 hover:text-white transition-all disabled:opacity-50"
        >
          {loading ? 'Loading...' : '↻ Refresh'}
        </button>

        <div className="ml-auto">
          {data && <SourceTag source={data.source ?? 'Loading...'} lastUpdated={data.lastUpdated} />}
        </div>
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      {/* ── Unusual Volume ── */}
      {unusual.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-amber-400 font-bold text-sm uppercase tracking-widest">🔥 Unusual Volume</h2>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {unusual.length}
            </span>
            <span className="text-xs text-gray-600">RVOL 2x+ — high conviction moves</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {unusual.map((q) => (
              <CandidateCard key={q.symbol} q={q} rvolThreshold={rvolThreshold} />
            ))}
          </div>
        </section>
      )}

      {/* ── All Intraday Candidates ── */}
      {regular.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-white font-bold text-sm uppercase tracking-widest">
              Intraday Candidates
            </h2>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[#1e1e1e] text-gray-400 border border-[#2a2a2a]">
              {regular.length}
            </span>
            <span className="text-xs text-gray-600">RVOL ≥ {rvolThreshold} or new day high</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {regular.map((q) => (
              <CandidateCard key={q.symbol} q={q} rvolThreshold={rvolThreshold} />
            ))}
          </div>
        </section>
      )}

      {!loading && intraday.length === 0 && !data?.sourceError && (
        <div className="text-center py-12 text-gray-600">
          No intraday candidates at this RVOL threshold. Try lowering it or switching to Market Scan.
        </div>
      )}

      <p className="text-xs text-gray-700">
        Opening range, VWAP, and structure confirmed live on TradingView. Option contracts filtered Δ 0.20–0.70.
      </p>
    </div>
  );
}

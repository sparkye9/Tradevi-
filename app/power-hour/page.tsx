'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import TradingViewButton from '@/components/ui/TradingViewButton';
import { useTradeviStore, MARKET_TICKERS } from '@/store/tradeviStore';
import type { FinvizQuote, FinvizResult } from '@/lib/finviz';
import type { TradierContract, TradierOptionsResult } from '@/lib/tradier';

// ─── Options panel (same as Intraday) ────────────────────────────────────────

function ContractRow({ c }: { c: TradierContract }) {
  const mid = c.bid !== null && c.ask !== null ? ((c.bid + c.ask) / 2).toFixed(2) : '--';
  const typeColor = c.type === 'call' ? 'text-emerald-400' : 'text-red-400';
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#1e1e1e] last:border-0 text-xs font-mono">
      <div className="flex items-center gap-2">
        <span className={`font-semibold uppercase ${typeColor}`}>{c.type}</span>
        <span className="text-gray-300">${c.strike}</span>
        <span className="text-gray-600">{c.expiration}</span>
      </div>
      <div className="flex items-center gap-3">
        {c.delta !== null && <span className={typeColor}>Δ{c.delta.toFixed(2)}</span>}
        {c.iv !== null && <span className="text-gray-500">IV {(c.iv * 100).toFixed(0)}%</span>}
        <span className="text-white font-semibold">${mid}</span>
        {c.openInterest !== null && <span className="text-gray-600">OI {c.openInterest.toLocaleString()}</span>}
      </div>
    </div>
  );
}

function OptionsPanel({ symbol }: { symbol: string }) {
  const [result, setResult] = useState<TradierOptionsResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tradier/options?symbol=${symbol}`)
      .then((r) => r.json())
      .then((json) => { if (!cancelled) { setResult(json); setLoading(false); } })
      .catch(() => { if (!cancelled) { setResult({ contracts: [], sourceError: 'Fetch failed', source: 'Tradier', lastUpdated: new Date().toISOString() }); setLoading(false); } });
    return () => { cancelled = true; };
  }, [symbol]);

  if (loading) return <div className="mt-3 pt-3 border-t border-[#1e1e1e] text-xs text-gray-600 animate-pulse">Loading contracts...</div>;
  if (result?.sourceError) return <div className="mt-3 pt-3 border-t border-[#1e1e1e] text-xs text-red-500/70">{result.sourceError}</div>;

  const calls = (result?.contracts ?? []).filter((c) => c.type === 'call').slice(0, 4);
  const puts = (result?.contracts ?? []).filter((c) => c.type === 'put').slice(0, 4);

  if (calls.length === 0 && puts.length === 0) {
    return <div className="mt-3 pt-3 border-t border-[#1e1e1e] text-xs text-gray-600">No qualifying contracts</div>;
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
      <p className="text-xs text-gray-700">{result?.source} · Δ 0.20–0.70</p>
    </div>
  );
}

// ─── Candidate card ───────────────────────────────────────────────────────────

function CandidateCard({ q, powerThreshold }: { q: FinvizQuote; powerThreshold: number }) {
  const [showOptions, setShowOptions] = useState(false);
  const isUnusual = (q.rvol ?? 0) >= 2;
  const chgColor = (q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400';
  const borderClass = isUnusual
    ? 'border-amber-500/40 hover:border-amber-500/70'
    : 'border-[#1e1e1e] hover:border-[#2a2a2a]';

  return (
    <div className={`bg-[#111111] border ${borderClass} rounded-2xl p-4 flex flex-col gap-3 transition-all`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <span className="text-white font-bold font-mono text-2xl">{q.symbol}</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-white font-mono font-semibold">
              {q.price !== null ? `$${q.price.toFixed(2)}` : '--'}
            </span>
            <span className={`font-mono font-semibold ${chgColor}`}>
              {q.changePercent !== null ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%` : '--'}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isUnusual ? (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              🔥 RVOL {q.rvol!.toFixed(2)}
            </span>
          ) : q.rvol !== null ? (
            <span className={`text-xs font-mono ${(q.rvol ?? 0) >= powerThreshold ? 'text-amber-400' : 'text-gray-500'}`}>
              RVOL {q.rvol.toFixed(2)}
            </span>
          ) : null}
          {q.newHighDay && (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              NEW HIGH
            </span>
          )}
        </div>
      </div>

      {/* SMA + sector */}
      <div className="flex items-center justify-between text-xs font-mono">
        <div className="flex gap-2">
          <span className="text-gray-600">
            SMA50 <span className={q.sma50rel === 'above' ? 'text-emerald-400' : 'text-red-400'}>
              {q.sma50rel === 'above' ? '▲' : q.sma50rel === 'below' ? '▼' : '?'}
            </span>
          </span>
          <span className="text-gray-600">
            200 <span className={q.sma200rel === 'above' ? 'text-emerald-400' : 'text-red-400'}>
              {q.sma200rel === 'above' ? '▲' : q.sma200rel === 'below' ? '▼' : '?'}
            </span>
          </span>
        </div>
        {q.groupStrength && (
          <span className={`text-xs font-semibold ${q.groupStrength === 'strong' ? 'text-emerald-400' : q.groupStrength === 'weak' ? 'text-red-400' : 'text-gray-600'}`}>
            {q.groupStrength} sector
          </span>
        )}
      </div>

      {/* Gap */}
      {q.gap !== null && Math.abs(q.gap) > 0.5 && (
        <span className={`text-xs font-mono self-start ${q.gap > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          Gap {q.gap > 0 ? '+' : ''}{q.gap.toFixed(2)}%
        </span>
      )}

      {/* Action row */}
      <div className="flex items-center gap-2 pt-1 border-t border-[#1e1e1e]">
        <button
          onClick={() => setShowOptions((p) => !p)}
          className={`flex-1 text-xs font-semibold py-1.5 px-3 rounded-lg transition-all border ${
            showOptions
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              : 'text-gray-500 hover:text-gray-300 border-[#2a2a2a] hover:border-[#3a3a3a]'
          }`}
        >
          {showOptions ? '▼ Contracts' : '▶ Contracts'}
        </button>
        <TradingViewButton symbol={q.symbol} label="Chart" />
      </div>

      {showOptions && <OptionsPanel symbol={q.symbol} />}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const POWER_HOUR_CHECKLIST = [
  'Session trend confirmed',
  'Volume expanding into close',
  'Key level identified',
  'Stop placement clear',
  'Risk/reward minimum 1:2',
];

function usePowerHourStatus() {
  const [isPowerHour, setIsPowerHour] = useState(false);
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    function update() {
      const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const h = et.getHours();
      const m = et.getMinutes();
      const s = et.getSeconds();
      const totalMinutes = h * 60 + m;
      const isActive = totalMinutes >= 900 && totalMinutes < 960;
      setIsPowerHour(isActive);
      if (!isActive) {
        let minutesUntil = 0;
        if (totalMinutes < 900) {
          minutesUntil = 900 - totalMinutes;
        } else {
          minutesUntil = 1440 - totalMinutes + 900;
        }
        const hrs = Math.floor(minutesUntil / 60);
        const mins = minutesUntil % 60;
        const secs = 59 - s;
        setCountdown(hrs > 0 ? `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${mins}:${String(secs).padStart(2, '0')}`);
      }
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return { isPowerHour, countdown };
}

export default function PowerHourPage() {
  const { watchlist, rvolThreshold, scanMode, setScanMode } = useTradeviStore();
  const [data, setData] = useState<FinvizResult<FinvizQuote> | null>(null);
  const [loading, setLoading] = useState(true);
  const [phChecklist, setPhChecklist] = useState<boolean[]>([false, false, false, false, false]);
  const { isPowerHour, countdown } = usePowerHourStatus();

  useEffect(() => {
    const saved = sessionStorage.getItem('ph-checklist');
    if (saved) setPhChecklist(JSON.parse(saved));
  }, []);

  function togglePhCheck(i: number) {
    const updated = phChecklist.map((v, idx) => idx === i ? !v : v);
    setPhChecklist(updated);
    sessionStorage.setItem('ph-checklist', JSON.stringify(updated));
  }

  const allChecked = phChecklist.every(Boolean);

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

  const powerThreshold = rvolThreshold * 1.2;

  const candidates = [...(data?.data ?? [])]
    .filter((q) => q.newHighDay || (q.rvol ?? 0) >= powerThreshold || Math.abs(q.changePercent ?? 0) >= 2)
    .sort((a, b) => (b.rvol ?? 0) - (a.rvol ?? 0));

  const unusual = candidates.filter((q) => (q.rvol ?? 0) >= 2);
  const regular = candidates.filter((q) => (q.rvol ?? 0) < 2);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Power Hour</h1>
          <p className="text-sm text-gray-500 mt-1">3:00–4:00 PM ET. End-of-day execution.</p>
        </div>
        <div className="ml-auto">
          {isPowerHour ? (
            <div className="bg-red-500/20 border border-red-500/50 text-red-400 font-bold text-lg px-4 py-2 rounded-xl animate-pulse">
              POWER HOUR ACTIVE
            </div>
          ) : (
            <div className="bg-[#111111] border border-[#1e1e1e] rounded-xl px-4 py-2 text-sm text-gray-400">
              POWER HOUR: Opens in <span className="font-mono text-white font-semibold">{countdown}</span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Pre-Entry Execution Checklist</h2>
        <div className="space-y-2">
          {POWER_HOUR_CHECKLIST.map((item, i) => (
            <label key={i} className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={phChecklist[i]}
                onChange={() => togglePhCheck(i)}
                className="accent-emerald-500 w-4 h-4"
              />
              <span className={`text-sm transition-colors ${phChecklist[i] ? 'text-emerald-400 line-through' : 'text-gray-300 group-hover:text-white'}`}>
                {item}
              </span>
            </label>
          ))}
        </div>
        {allChecked && (
          <div className="mt-2 text-emerald-400 font-semibold text-sm">
            CHECKLIST COMPLETE — You may proceed
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

        <button
          onClick={load}
          disabled={loading}
          className="px-4 py-1.5 text-xs font-semibold bg-[#1a1a1a] border border-[#2a2a2a] rounded-full text-gray-300 hover:border-emerald-500/30 hover:text-white transition-all disabled:opacity-50"
        >
          {loading ? 'Scanning...' : '↻ Refresh'}
        </button>

        <div className="ml-auto">
          {data && <SourceTag source={data.source ?? ''} lastUpdated={data.lastUpdated} />}
        </div>
      </div>

      <div className="text-xs text-gray-600 px-1">
        Showing: new day high · RVOL &gt; {powerThreshold.toFixed(1)} · change &gt; 2% · click ▶ Contracts for live calls &amp; puts
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      {/* Unusual Volume */}
      {unusual.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-amber-400 font-bold text-sm uppercase tracking-widest">🔥 Unusual Volume</h2>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {unusual.length}
            </span>
            <span className="text-xs text-gray-600">RVOL 2x+ — strongest conviction into close</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {unusual.map((q) => <CandidateCard key={q.symbol} q={q} powerThreshold={powerThreshold} />)}
          </div>
        </section>
      )}

      {/* All Power Hour candidates */}
      {regular.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-white font-bold text-sm uppercase tracking-widest">All Candidates</h2>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[#1e1e1e] text-gray-400 border border-[#2a2a2a]">
              {regular.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {regular.map((q) => <CandidateCard key={q.symbol} q={q} powerThreshold={powerThreshold} />)}
          </div>
        </section>
      )}

      {!loading && candidates.length === 0 && !data?.sourceError && (
        <div className="text-center py-12 text-gray-600">
          No power hour candidates yet. Try switching to Market Scan or check back closer to 3 PM ET.
        </div>
      )}

      <p className="text-xs text-gray-700">
        VWAP reclaim and structure confirmed on TradingView. Contracts filtered Δ 0.20–0.70 via Tradier.
      </p>
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import TradingViewButton from '@/components/ui/TradingViewButton';
import { useTradeviStore, MARKET_TICKERS } from '@/store/tradeviStore';
import type { FinvizQuote, FinvizResult } from '@/lib/finviz';
import type { TradierContract, TradierOptionsResult } from '@/lib/tradier';

// ─── Options panel ────────────────────────────────────────────────────────────

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
  const puts  = (result?.contracts ?? []).filter((c) => c.type === 'put').slice(0, 4);

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

// ─── Trading guide section ─────────────────────────────────────────────────────

function TradingGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-[#111111] transition-colors"
      >
        <span className="text-sm font-bold text-gray-300">📖 Power Hour Trading Guide</span>
        <span className="text-gray-500 text-xs">{open ? '▲ hide' : '▼ show'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 text-sm text-gray-400 border-t border-[#1e1e1e] pt-4">

          {/* What is Power Hour */}
          <div>
            <p className="text-gray-200 font-semibold mb-1">What is Power Hour?</p>
            <p>3:00 PM – 4:00 PM ET. The last hour of the regular session. Institutional money, hedge funds, and pension funds make final position adjustments. Volume spikes. Trends accelerate or reverse hard.</p>
          </div>

          {/* 3 types */}
          <div className="space-y-3">
            <p className="text-gray-200 font-semibold">The 3 Types of Power Hour</p>

            <div className="border border-emerald-500/20 rounded-xl p-3 space-y-1">
              <p className="text-emerald-400 font-bold text-xs uppercase tracking-wide">1. Trend Continuation</p>
              <p>Market trends all day and keeps going. QQQ bullish, higher highs, higher lows, strong breadth. Buyers pile in at 3 PM. New highs into the close. Calls gain rapidly.</p>
              <p className="text-xs text-gray-600">→ Easiest Power Hour to trade. Ride momentum.</p>
            </div>

            <div className="border border-amber-500/20 rounded-xl p-3 space-y-1">
              <p className="text-amber-400 font-bold text-xs uppercase tracking-wide">2. Reversal</p>
              <p>Market trends one way all day then flips. QQQ down all day, sellers exhaust, VIX starts falling, buyers step in. Sharp rally into the close traps the late shorts.</p>
              <p className="text-xs text-gray-600">→ Higher risk. Wait for confirmation before entering.</p>
            </div>

            <div className="border border-gray-700 rounded-xl p-3 space-y-1">
              <p className="text-gray-400 font-bold text-xs uppercase tracking-wide">3. Chop</p>
              <p>Sideways, low volatility, no direction. Usually happens before major news or when institutions are waiting. Best trade: no trade.</p>
              <p className="text-xs text-gray-600">→ If you can&apos;t identify the type by 3:05, sit out.</p>
            </div>
          </div>

          {/* Checklist */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-emerald-400 font-semibold text-xs uppercase tracking-wide mb-2">Bullish Setup</p>
              {['Higher lows forming', 'Price above VWAP', 'Price above 9 EMA', 'Volume increasing after 3 PM', 'QQQ/SPY making new intraday highs', 'Market breadth positive'].map((item) => (
                <div key={item} className="flex items-center gap-2 text-xs">
                  <span className="text-emerald-400">✅</span> {item}
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <p className="text-red-400 font-semibold text-xs uppercase tracking-wide mb-2">Bearish Setup</p>
              {['Lower highs forming', 'Price below VWAP', 'Repeated rejection at resistance', 'Selling volume increasing', 'QQQ/SPY making new intraday lows', 'Breadth deteriorating'].map((item) => (
                <div key={item} className="flex items-center gap-2 text-xs">
                  <span className="text-red-400">✅</span> {item}
                </div>
              ))}
            </div>
          </div>

          {/* 2:45 checklist */}
          <div className="border border-[#2a2a2a] rounded-xl p-4 space-y-2">
            <p className="text-white font-bold text-xs uppercase tracking-wide">At 2:45 PM Ask Yourself</p>
            {[
              'Is price above or below VWAP?',
              'Are higher lows forming?',
              'Is volume increasing?',
              'Is the trend intact on the 15-min chart?',
              'Are QQQ and SPY supporting the move?',
            ].map((q, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-gray-300">
                <span className="text-amber-400 font-bold shrink-0">{i + 1}.</span> {q}
              </div>
            ))}
            <p className="text-xs text-gray-600 mt-2 pt-2 border-t border-[#1e1e1e]">
              4 of 5 yes → decent continuation probability. 2 or fewer yes → be careful. Theta and end-of-day profit-taking can hit hard.
            </p>
          </div>

          {/* Options note */}
          <div className="border border-emerald-500/15 rounded-xl p-4 space-y-1">
            <p className="text-white font-bold text-xs uppercase tracking-wide mb-2">For Options Specifically</p>
            {[
              'Delta > 0.50 — high enough to move with the underlying',
              'Trend aligned with QQQ/SPY',
              'Strong relative strength',
              'Increasing volume after 3 PM',
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-gray-300">
                <span className="text-emerald-400 shrink-0">→</span> {item}
              </div>
            ))}
            <p className="text-xs text-gray-600 mt-2 pt-2 border-t border-[#1e1e1e]">
              Watch volume after 3:30 PM more than price alone. A lot of traders sell winners between 3:45 and 4:00 PM — a stock can look great at 3:15 and still pull back into the close.
            </p>
          </div>

        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PowerHourPage() {
  const { watchlist, rvolThreshold, scanMode, setScanMode } = useTradeviStore();
  const [data, setData] = useState<FinvizResult<FinvizQuote> | null>(null);
  const [loading, setLoading] = useState(true);

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
      <div>
        <h1 className="text-2xl font-bold text-white">Power Hour</h1>
        <p className="text-sm text-gray-500 mt-1">3:00 – 4:00 PM ET · Quick scalps &amp; big wins into the close</p>
      </div>

      {/* Trading guide */}
      <TradingGuide />

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
        Showing: new day high · RVOL &gt; {powerThreshold.toFixed(1)} · change &gt; 2% · expand for live contracts
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

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

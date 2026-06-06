'use client';
import { useEffect, useState, useCallback } from 'react';

// ─── Fee Schedule ─────────────────────────────────────────────────────────────
// Kalshi fee schedule — update these when Kalshi changes fees
// Current: taker fee = min(7% of profit, 7 cents) per contract per side
// Source: https://kalshi.com/docs/kalshi-fee-schedule.pdf
const FEE_PCT = 0.07;         // 7% of profit on winning contracts
const FEE_CAP_CENTS = 7;      // max 7 cents per contract

function kalshiFee(priceCents: number): number {
  // fee on a winning contract bought at priceCents
  const profit = 100 - priceCents;
  return Math.min(FEE_PCT * profit, FEE_CAP_CENTS);
}

function netEV(impliedProb: number, userProb: number, priceCents: number): number {
  // EV in cents per contract, net of taker fees
  const fee = kalshiFee(priceCents);
  const profit = 100 - priceCents - fee;
  return userProb * profit - (1 - userProb) * priceCents;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  series_ticker: string;
  title: string;
  yes_bid: number | null;
  yes_ask: number | null;
  no_bid: number | null;
  no_ask: number | null;
  last_price: number | null;
  volume: number;
  volume_24h: number;
  open_interest: number;
  close_time: string;
  category: string;
  status: string;
}

interface OverroundArb {
  event_ticker: string;
  legs: KalshiMarket[];
  askSum: number;
  overround: number;
  tradeable: boolean;
  module: 'A';
}

interface ImplicationBreak {
  seriesTicker: string;
  lowerMarket: KalshiMarket;
  higherMarket: KalshiMarket;
  lowerThreshold: number;
  higherThreshold: number;
  lowerAsk: number;
  higherAsk: number;
  spread: number;
  module: 'B';
}

interface StaleMarket {
  market: KalshiMarket;
  reason: string;
  module: 'D';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function midPrice(market: KalshiMarket): number | null {
  if (market.yes_bid == null || market.yes_ask == null) return null;
  return (market.yes_bid + market.yes_ask) / 2;
}

function spread(market: KalshiMarket): number | null {
  if (market.yes_bid == null || market.yes_ask == null) return null;
  return market.yes_ask - market.yes_bid;
}

function spreadLabel(s: number | null): string {
  if (s === null) return '--';
  if (s <= 4) return 'Liquid';
  if (s <= 10) return 'Normal';
  return 'Thin';
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return iso;
  }
}

function formatCloseTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/New_York',
    });
  } catch {
    return iso;
  }
}

function isToday(iso: string): boolean {
  try {
    const d = new Date(iso);
    const now = new Date();
    const ny = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
    return ny.format(d) === ny.format(now);
  } catch {
    return false;
  }
}

function isWithinWeek(iso: string): boolean {
  try {
    const d = new Date(iso);
    const week = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return d <= week && d >= new Date();
  } catch {
    return false;
  }
}

function parseThreshold(title: string): number | null {
  const m =
    title.match(/above\s+([\d.,]+)/i) ||
    title.match(/at\s+least\s+([\d.,]+)/i) ||
    title.match(/>\s*([\d.,]+)/);
  if (!m) return null;
  return parseFloat(m[1].replace(/,/g, ''));
}

// ─── Module A: Overround arb detection ────────────────────────────────────────

function detectOverroundArbs(markets: KalshiMarket[]): OverroundArb[] {
  const byEvent = new Map<string, KalshiMarket[]>();
  for (const m of markets) {
    if (!m.event_ticker) continue;
    const arr = byEvent.get(m.event_ticker) ?? [];
    arr.push(m);
    byEvent.set(m.event_ticker, arr);
  }

  const arbs: OverroundArb[] = [];
  Array.from(byEvent.entries()).forEach(([event_ticker, legs]) => {
    if (legs.length < 2) return;
    if (!legs.every((l: KalshiMarket) => l.yes_ask != null)) return;
    const askSum = legs.reduce((s: number, l: KalshiMarket) => s + (l.yes_ask ?? 0), 0);
    if (askSum <= 100) return;
    const tradeable = legs.filter((l: KalshiMarket) => (spread(l) ?? 99) <= 10).length >= 3;
    arbs.push({ event_ticker, legs, askSum, overround: askSum - 100, tradeable, module: 'A' });
  });
  return arbs.sort((a, b) => b.overround - a.overround);
}

// ─── Module B: Implication break detection ────────────────────────────────────

function detectImplicationBreaks(markets: KalshiMarket[]): ImplicationBreak[] {
  const bySeries = new Map<string, KalshiMarket[]>();
  for (const m of markets) {
    if (!m.series_ticker) continue;
    const arr = bySeries.get(m.series_ticker) ?? [];
    arr.push(m);
    bySeries.set(m.series_ticker, arr);
  }

  const breaks: ImplicationBreak[] = [];
  Array.from(bySeries.entries()).forEach(([seriesTicker, legs]) => {
    const withThreshold = legs
      .map((l: KalshiMarket) => ({ market: l, threshold: parseThreshold(l.title) }))
      .filter((x): x is { market: KalshiMarket; threshold: number } => x.threshold !== null && x.market.yes_ask != null)
      .sort((a: { threshold: number }, b: { threshold: number }) => a.threshold - b.threshold);

    for (let i = 1; i < withThreshold.length; i++) {
      const lower = withThreshold[i - 1];
      const higher = withThreshold[i];
      const lowerAsk = lower.market.yes_ask!;
      const higherAsk = higher.market.yes_ask!;
      if (higherAsk > lowerAsk) {
        breaks.push({
          seriesTicker,
          lowerMarket: lower.market,
          higherMarket: higher.market,
          lowerThreshold: lower.threshold,
          higherThreshold: higher.threshold,
          lowerAsk,
          higherAsk,
          spread: higherAsk - lowerAsk,
          module: 'B',
        });
      }
    }
  });
  return breaks.sort((a, b) => b.spread - a.spread);
}

// ─── Module D: Stale thin market detection ────────────────────────────────────

function detectStaleMarkets(markets: KalshiMarket[]): StaleMarket[] {
  return markets
    .filter((m) => m.volume_24h < 50 && (spread(m) ?? 0) > 10)
    .map((m) => ({
      market: m,
      reason: `vol_24h=${m.volume_24h}, spread=${spread(m)}¢`,
      module: 'D' as const,
    }));
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 animate-pulse h-20" />
      ))}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EdgeScannerPage() {
  const [markets, setMarkets] = useState<KalshiMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Filters
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'all'>('today');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [minVolume, setMinVolume] = useState(0);
  const [minEdge, setMinEdge] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Module C user probs
  const [userProbs, setUserProbs] = useState<Record<string, number>>({});

  // Expanded rows
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  const fetchMarkets = useCallback(async () => {
    try {
      const res = await fetch('/api/kalshi/markets');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.sourceError && json.markets?.length === 0) {
        setError(json.sourceError);
      } else {
        setError(null);
      }
      const raw: KalshiMarket[] = json.markets ?? [];
      setMarkets(raw);
      setLastUpdated(json.lastUpdated ?? null);

      const cats = Array.from(new Set(raw.map((m) => m.category).filter(Boolean))).sort();
      setAllCategories(cats);
      setSelectedCategories((prev) => (prev.length === 0 ? cats : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kalshi data unavailable — check connection');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchMarkets, 30_000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchMarkets]);

  // ── Filter ──
  const filtered = markets.filter((m) => {
    if (dateFilter === 'today' && !isToday(m.close_time)) return false;
    if (dateFilter === 'week' && !isWithinWeek(m.close_time)) return false;
    if (selectedCategories.length > 0 && !selectedCategories.includes(m.category)) return false;
    if (m.volume < minVolume) return false;
    return true;
  });

  // ── Module detections ──
  const overroundArbs = detectOverroundArbs(filtered);
  const implicationBreaks = detectImplicationBreaks(filtered);
  const staleMarkets = detectStaleMarkets(filtered);

  // ── Ranked table rows (Module C + all) ──
  const tableRows = filtered
    .map((m) => {
      const mid = midPrice(m);
      const impliedProb = mid != null ? mid / 100 : null;
      const userProbPct = userProbs[m.ticker];
      const userProbFrac = userProbPct != null ? userProbPct / 100 : impliedProb;
      const edgePct =
        userProbPct != null && impliedProb != null ? userProbPct - impliedProb * 100 : null;
      const ev =
        userProbFrac != null && mid != null
          ? netEV(impliedProb ?? 0, userProbFrac, mid)
          : null;

      const sp = spread(m);
      const isStale = staleMarkets.some((s) => s.market.ticker === m.ticker);
      const isOverround = overroundArbs.some((a) => a.legs.some((l) => l.ticker === m.ticker));
      const isImplication = implicationBreaks.some(
        (b) => b.lowerMarket.ticker === m.ticker || b.higherMarket.ticker === m.ticker
      );

      let type: 'A' | 'B' | 'C' | 'D' = 'C';
      if (isOverround) type = 'A';
      else if (isImplication) type = 'B';
      else if (isStale) type = 'D';

      return { market: m, impliedProb, edgePct, ev, sp, type };
    })
    .filter((r) => {
      if (minEdge > 0) return r.edgePct != null && Math.abs(r.edgePct) >= minEdge;
      return true;
    })
    .sort((a, b) => (b.ev ?? -999) - (a.ev ?? -999));

  const structuralArbCount = overroundArbs.length + implicationBreaks.length;

  function toggleCategory(cat: string) {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  return (
    <div className="min-h-screen bg-[#111111] text-white p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold tracking-tight">Kalshi Edge Scanner</span>
          <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold px-2 py-0.5 rounded-full">
            BETA
          </span>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-500">
              Updated {formatTimestamp(lastUpdated)}
            </span>
          )}
          <button
            onClick={fetchMarkets}
            className="px-3 py-1.5 rounded-lg text-xs border border-[#2a2a2a] text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-all"
          >
            ↻ Refresh
          </button>
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
              autoRefresh
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'text-gray-500 border-[#2a2a2a] hover:text-gray-300'
            }`}
          >
            Auto {autoRefresh ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-4">
        <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Filters</span>

        <div className="flex flex-wrap items-center gap-4">
          {/* Date filter */}
          <div className="flex gap-1">
            {(['today', 'week', 'all'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDateFilter(d)}
                className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                  dateFilter === d
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'text-gray-500 border-[#2a2a2a] hover:text-gray-300'
                }`}
              >
                {d === 'today' ? 'Today' : d === 'week' ? 'This Week' : 'All Open'}
              </button>
            ))}
          </div>

          {/* Volume slider */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Min Vol:</span>
            <input
              type="range"
              min={0}
              max={500}
              step={50}
              value={minVolume}
              onChange={(e) => setMinVolume(Number(e.target.value))}
              className="w-24 accent-emerald-500"
            />
            <span className="text-xs text-gray-400 w-8">{minVolume}</span>
          </div>

          {/* Min edge slider */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Min Edge:</span>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={minEdge}
              onChange={(e) => setMinEdge(Number(e.target.value))}
              className="w-24 accent-emerald-500"
            />
            <span className="text-xs text-gray-400 w-8">{minEdge}%</span>
          </div>
        </div>

        {/* Category pills */}
        {allCategories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() =>
                setSelectedCategories(
                  selectedCategories.length === allCategories.length ? [] : allCategories
                )
              }
              className="px-2.5 py-0.5 rounded-full text-xs border border-[#2a2a2a] text-gray-500 hover:text-gray-300 transition-all"
            >
              {selectedCategories.length === allCategories.length ? 'None' : 'All'}
            </button>
            {allCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={`px-2.5 py-0.5 rounded-full text-xs border transition-all ${
                  selectedCategories.includes(cat)
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'text-gray-600 border-[#2a2a2a] hover:text-gray-400'
                }`}
              >
                {cat || 'Uncategorized'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Structural Arbs Panel ── */}
      {!loading && structuralArbCount > 0 && (
        <div className="bg-[#0f0f0f] border border-amber-500/20 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
              Structural Arbs
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-amber-500/20 text-amber-400 border-amber-500/30">
              {structuralArbCount}
            </span>
          </div>

          {/* Module A */}
          {overroundArbs.map((arb) => (
            <div key={arb.event_ticker} className="border border-[#2a2a2a] rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  MOD A
                </span>
                <span className="text-sm font-semibold text-white">{arb.event_ticker}</span>
                <span className="text-xs text-amber-400">
                  Overround: +{arb.overround.toFixed(1)}¢ ({arb.legs.length} legs, sum={arb.askSum.toFixed(1)})
                </span>
                {arb.tradeable && (
                  <span className="text-xs text-emerald-400">Tradeable</span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {arb.legs.map((leg) => (
                  <div key={leg.ticker} className="bg-[#1a1a1a] rounded-lg px-2.5 py-1.5 text-xs">
                    <span className="text-gray-400">{leg.title.slice(0, 35)}</span>
                    <span className="ml-2 text-amber-400 font-mono">ask={leg.yes_ask}¢</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-600 italic">
                ⚠ Verify settlement source before trading. Order book depth available on expansion.
              </p>
            </div>
          ))}

          {/* Module B */}
          {implicationBreaks.map((brk, i) => (
            <div key={i} className="border border-[#2a2a2a] rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  MOD B
                </span>
                <span className="text-sm font-semibold text-white">{brk.seriesTicker}</span>
                <span className="text-xs text-amber-400">
                  Break: +{brk.spread.toFixed(1)}¢
                </span>
              </div>
              <div className="flex gap-4 text-xs">
                <div className="bg-[#1a1a1a] rounded-lg px-2.5 py-1.5">
                  <span className="text-gray-400">Lower (≥{brk.lowerThreshold}): </span>
                  <span className="text-white font-mono">{brk.lowerAsk}¢</span>
                  <div className="text-gray-600 truncate max-w-[180px]">{brk.lowerMarket.title}</div>
                </div>
                <div className="text-gray-500 self-center">{'<'} ask</div>
                <div className="bg-[#1a1a1a] rounded-lg px-2.5 py-1.5">
                  <span className="text-gray-400">Higher (≥{brk.higherThreshold}): </span>
                  <span className="text-amber-400 font-mono">{brk.higherAsk}¢</span>
                  <div className="text-gray-600 truncate max-w-[180px]">{brk.higherMarket.title}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Main table ── */}
      <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
            Markets
          </span>
          {!loading && (
            <span className="text-xs text-gray-600">
              {tableRows.length} shown / {markets.length} total
            </span>
          )}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <SkeletonRows />
        ) : tableRows.length === 0 ? (
          <p className="text-gray-500 text-sm py-4">
            {markets.length === 0
              ? 'Kalshi data unavailable — check connection'
              : 'No markets match current filters'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1e1e1e]">
                  {[
                    'Market',
                    'Category',
                    'Resolves',
                    'Implied %',
                    'Your %',
                    'Edge %',
                    <span key="ev" title="Net EV in cents per contract, after taker fees">
                      Net EV <span className="text-gray-600">(net fees)</span>
                    </span>,
                    'Spread',
                    'Vol 24h',
                    'Type',
                  ].map((col, i) => (
                    <th
                      key={i}
                      className="text-left text-gray-500 font-semibold uppercase tracking-wider pb-2 pr-3"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map(({ market: m, impliedProb, edgePct, ev, sp, type }) => {
                  const expanded = expandedTicker === m.ticker;
                  const spreadLbl = spreadLabel(sp);
                  const spreadColor =
                    spreadLbl === 'Liquid'
                      ? 'text-emerald-400'
                      : spreadLbl === 'Normal'
                      ? 'text-gray-400'
                      : 'text-amber-400';

                  const typeBadge =
                    type === 'A' || type === 'B'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : type === 'C'
                      ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                      : 'bg-gray-500/20 text-gray-400 border-gray-500/30';

                  const edgeColor =
                    edgePct == null
                      ? 'text-gray-500'
                      : edgePct > 0
                      ? 'text-emerald-400'
                      : 'text-red-400';

                  return (
                    <>
                      <tr
                        key={m.ticker}
                        onClick={() => setExpandedTicker(expanded ? null : m.ticker)}
                        className="border-b border-[#1a1a1a] hover:bg-white/[0.02] cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 pr-3 max-w-[200px]">
                          <div className="text-white font-medium truncate">{m.title}</div>
                          <div className="text-gray-600 font-mono">{m.ticker}</div>
                        </td>
                        <td className="py-2.5 pr-3 text-gray-400">{m.category || '—'}</td>
                        <td className="py-2.5 pr-3 text-gray-400 whitespace-nowrap">
                          {formatCloseTime(m.close_time)}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-white">
                          {impliedProb != null ? (impliedProb * 100).toFixed(1) + '%' : '—'}
                        </td>
                        <td className="py-2.5 pr-3">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={userProbs[m.ticker] ?? ''}
                            placeholder="—"
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              setUserProbs((prev) => ({
                                ...prev,
                                [m.ticker]: isNaN(v) ? 0 : Math.min(100, Math.max(0, v)),
                              }));
                            }}
                            className="w-16 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1.5 py-0.5 text-white font-mono text-xs text-center focus:outline-none focus:border-emerald-500/50"
                          />
                        </td>
                        <td className={`py-2.5 pr-3 font-mono font-bold ${edgeColor}`}>
                          {edgePct != null
                            ? (edgePct > 0 ? '+' : '') + edgePct.toFixed(1) + '%'
                            : '—'}
                        </td>
                        <td className="py-2.5 pr-3 font-mono">
                          {ev != null ? (
                            <span className={ev >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                              {ev >= 0 ? '+' : ''}{ev.toFixed(1)}¢
                            </span>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className={`py-2.5 pr-3 font-mono ${spreadColor}`}>
                          {sp != null ? `${sp}¢ ` : ''}
                          <span className="text-gray-600">{spreadLbl}</span>
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-gray-400">
                          {m.volume_24h.toLocaleString()}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${typeBadge}`}
                          >
                            {type}
                          </span>
                        </td>
                      </tr>

                      {expanded && (
                        <tr key={`${m.ticker}-expand`}>
                          <td colSpan={10} className="pb-3 px-2">
                            <div className="bg-[#0f0f0f] border border-[#2a2a2a] rounded-xl p-4 text-xs space-y-2">
                              {(type === 'A' || type === 'B') && (
                                <>
                                  {overroundArbs
                                    .filter((a) => a.legs.some((l) => l.ticker === m.ticker))
                                    .map((arb) => (
                                      <div key={arb.event_ticker} className="space-y-1">
                                        <p className="text-amber-400 font-semibold">
                                          Overround Arb — {arb.event_ticker}
                                        </p>
                                        <p className="text-gray-400">
                                          Sum of yes_asks across {arb.legs.length} legs ={' '}
                                          <span className="text-white font-mono">{arb.askSum.toFixed(1)}¢</span>
                                          {' '}&gt; 100 → overround{' '}
                                          <span className="text-amber-400 font-mono">
                                            +{arb.overround.toFixed(1)}¢
                                          </span>
                                        </p>
                                        <div className="flex flex-wrap gap-1">
                                          {arb.legs.map((leg) => (
                                            <span key={leg.ticker} className="bg-[#1a1a1a] rounded px-2 py-0.5 text-gray-300">
                                              {leg.ticker}: ask={leg.yes_ask}¢
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  {implicationBreaks
                                    .filter(
                                      (b) =>
                                        b.lowerMarket.ticker === m.ticker ||
                                        b.higherMarket.ticker === m.ticker
                                    )
                                    .map((brk, i) => (
                                      <div key={i} className="space-y-1">
                                        <p className="text-blue-400 font-semibold">
                                          Implication Break — {brk.seriesTicker}
                                        </p>
                                        <p className="text-gray-400">
                                          Higher threshold (≥{brk.higherThreshold}) ask{' '}
                                          <span className="text-amber-400 font-mono">{brk.higherAsk}¢</span>
                                          {' '}&gt; lower threshold (≥{brk.lowerThreshold}) ask{' '}
                                          <span className="text-white font-mono">{brk.lowerAsk}¢</span>
                                          {' '}— violates monotonicity by{' '}
                                          <span className="text-amber-400 font-mono">+{brk.spread.toFixed(1)}¢</span>
                                        </p>
                                      </div>
                                    ))}
                                </>
                              )}

                              {type === 'C' && (
                                <div className="space-y-1">
                                  <p className="text-blue-400 font-semibold">Module C — Opinion Edge</p>
                                  {userProbs[m.ticker] != null && impliedProb != null ? (
                                    <p className="text-gray-400">
                                      Your estimate:{' '}
                                      <span className="text-white font-mono">{userProbs[m.ticker]}%</span>
                                      {' '}vs market implied:{' '}
                                      <span className="text-white font-mono">
                                        {(impliedProb * 100).toFixed(1)}%
                                      </span>
                                      {' '}={' '}
                                      <span className={edgePct! > 0 ? 'text-emerald-400' : 'text-red-400'}>
                                        {edgePct! > 0 ? '+' : ''}{edgePct!.toFixed(1)}% edge
                                      </span>
                                      . Net EV:{' '}
                                      <span className={ev! >= 0 ? 'text-emerald-400 font-mono' : 'text-red-400 font-mono'}>
                                        {ev! >= 0 ? '+' : ''}{ev!.toFixed(2)}¢
                                      </span>{' '}
                                      per contract.
                                    </p>
                                  ) : (
                                    <p className="text-gray-500">
                                      Enter your probability estimate in &quot;Your %&quot; to compute edge and EV.
                                    </p>
                                  )}
                                  {impliedProb != null && (
                                    <p className="text-gray-600">
                                      Mid price: {midPrice(m)?.toFixed(1)}¢ | Fee on win:{' '}
                                      {kalshiFee(midPrice(m) ?? 50).toFixed(2)}¢ | Profit after fee:{' '}
                                      {(100 - (midPrice(m) ?? 50) - kalshiFee(midPrice(m) ?? 50)).toFixed(2)}¢
                                    </p>
                                  )}
                                </div>
                              )}

                              {type === 'D' && (
                                <div className="space-y-1">
                                  <p className="text-gray-400 font-semibold">Module D — Stale / Thin</p>
                                  <p className="text-gray-500">
                                    Low activity — verify if a related market has moved.{' '}
                                    {staleMarkets.find((s) => s.market.ticker === m.ticker)?.reason}
                                  </p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

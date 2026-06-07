'use client';
import { useEffect, useState, useCallback } from 'react';

// ─── Fee config ───────────────────────────────────────────────────────────────
const FEE_PCT = 0.07;
const FEE_CAP_CENTS = 7;

function kalshiFee(priceCents: number): number {
  return Math.min(FEE_PCT * (100 - priceCents), FEE_CAP_CENTS);
}
function netProfit(priceCents: number): number {
  return 100 - priceCents - kalshiFee(priceCents);
}
// "If I bet $1, I get back $X total" — the number the user cares about
function dollarMultiplier(priceCents: number): number {
  return (priceCents + netProfit(priceCents)) / priceCents;
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

// ─── Scoring helpers ──────────────────────────────────────────────────────────

function noCostCents(m: KalshiMarket): number | null {
  if (m.yes_bid == null) return null;
  return 100 - m.yes_bid;
}

// Find the cheapest side and its price
function cheapestSide(m: KalshiMarket): { side: 'YES' | 'NO'; price: number } | null {
  const yesCost = m.yes_ask;
  const noCost = noCostCents(m);
  if (yesCost == null && noCost == null) return null;
  if (yesCost == null) return noCost != null ? { side: 'NO', price: noCost } : null;
  if (noCost == null) return { side: 'YES', price: yesCost };
  return yesCost <= noCost ? { side: 'YES', price: yesCost } : { side: 'NO', price: noCost };
}

function spreadCents(m: KalshiMarket): number | null {
  if (m.yes_bid == null || m.yes_ask == null) return null;
  return m.yes_ask - m.yes_bid;
}

function hoursUntilClose(m: KalshiMarket): number {
  return (new Date(m.close_time).getTime() - Date.now()) / 3_600_000;
}

function fmtClose(iso: string): string {
  const h = (new Date(iso).getTime() - Date.now()) / 3_600_000;
  if (h < 0) return 'Resolving now';
  if (h < 1) return `${Math.floor(h * 60)}m left`;
  if (h < 24) return `${Math.floor(h)}h left`;
  const d = Math.floor(h / 24);
  return `${d}d left`;
}

// ─── The Hunt: overlooked cheap markets ──────────────────────────────────────
// These are the $1 → $X plays.
// Signals: cheap price (high multiplier) + low volume (overlooked) + resolving soon (event near)

interface HuntOpportunity {
  market: KalshiMarket;
  side: 'YES' | 'NO';
  priceCents: number;
  multiplier: number;     // $1 bet → $X back if correct
  isOverlooked: boolean;  // low volume signal
  hoursLeft: number;
  huntScore: number;
}

function buildHuntOpps(markets: KalshiMarket[]): HuntOpportunity[] {
  const opps: HuntOpportunity[] = [];

  for (const m of markets) {
    const cheap = cheapestSide(m);
    if (!cheap) continue;
    if (cheap.price > 30) continue; // only show ≤30¢ (≥3.3x multiplier)
    if (cheap.price < 1) continue;

    const hours = hoursUntilClose(m);
    if (hours < 0) continue; // already closed

    const mult = dollarMultiplier(cheap.price);
    const isOverlooked = m.volume_24h < 100;

    // Hunt score — higher is better opportunity
    // Cheap price (multiplier) is king, then overlooked signal, then near resolution
    let score = mult * 10;                          // core: multiplier
    if (isOverlooked) score += 20;                  // not being watched
    if (hours < 24) score += 15;                    // event is TODAY
    else if (hours < 72) score += 8;                // event is this week
    if (m.volume_24h === 0) score += 10;            // completely forgotten
    const sp = spreadCents(m);
    if (sp !== null && sp <= 6) score += 5;         // tradeable liquidity

    opps.push({ market: m, side: cheap.side, priceCents: cheap.price, multiplier: mult, isOverlooked, hoursLeft: hours, huntScore: score });
  }

  return opps.sort((a, b) => b.huntScore - a.huntScore);
}

// ─── Structural arbs (price conflicts) ───────────────────────────────────────

interface StructuralArb {
  type: 'OVERROUND' | 'IMPLICATION';
  markets: KalshiMarket[];
  description: string;
  edgeCents: number;
}

function detectArbs(markets: KalshiMarket[]): Map<string, StructuralArb> {
  const arbMap = new Map<string, StructuralArb>();

  // Overround: mutually exclusive markets in same event sum >100¢
  const byEvent = new Map<string, KalshiMarket[]>();
  for (const m of markets) {
    if (!byEvent.has(m.event_ticker)) byEvent.set(m.event_ticker, []);
    byEvent.get(m.event_ticker)!.push(m);
  }
  for (const [, group] of Array.from(byEvent.entries())) {
    if (group.length < 2) continue;
    const withAsks = group.filter((m: KalshiMarket) => m.yes_ask != null);
    if (withAsks.length < 2) continue;
    const askSum = withAsks.reduce((s: number, m: KalshiMarket) => s + m.yes_ask!, 0);
    if (askSum > 103) {
      const edge = askSum - 100;
      for (const m of withAsks) {
        arbMap.set(m.ticker, {
          type: 'OVERROUND',
          markets: withAsks,
          description: `All outcomes sum to ${askSum}¢ — should be 100¢. ${edge}¢ mispriced.`,
          edgeCents: edge,
        });
      }
    }
  }

  // Implication: higher threshold priced more than lower threshold
  const bySeries = new Map<string, KalshiMarket[]>();
  for (const m of markets) {
    if (!m.series_ticker) continue;
    if (!bySeries.has(m.series_ticker)) bySeries.set(m.series_ticker, []);
    bySeries.get(m.series_ticker)!.push(m);
  }
  for (const [, group] of Array.from(bySeries.entries())) {
    if (group.length < 2) continue;
    const parsed = group.map((m: KalshiMarket) => {
      const match = m.title.match(/(?:above|at least|>|≥|over)\s*([\d.]+)/i);
      return match ? { m, threshold: parseFloat(match[1]) } : null;
    }).filter(Boolean) as { m: KalshiMarket; threshold: number }[];
    if (parsed.length < 2) continue;
    parsed.sort((a, b) => a.threshold - b.threshold);
    for (let i = 0; i < parsed.length - 1; i++) {
      const lo = parsed[i], hi = parsed[i + 1];
      if (!lo.m.yes_ask || !hi.m.yes_ask) continue;
      if (hi.m.yes_ask > lo.m.yes_ask + 2) {
        const edge = hi.m.yes_ask - lo.m.yes_ask;
        const desc = `"${hi.m.title}" priced higher than "${lo.m.title}" — impossible. ${edge}¢ gap.`;
        arbMap.set(lo.m.ticker, { type: 'IMPLICATION', markets: [lo.m, hi.m], description: desc, edgeCents: edge });
        arbMap.set(hi.m.ticker, { type: 'IMPLICATION', markets: [lo.m, hi.m], description: desc, edgeCents: edge });
      }
    }
  }

  return arbMap;
}

// ─── Profit Calculator ────────────────────────────────────────────────────────

function ProfitCalc({ priceCents, side }: { priceCents: number; side: 'YES' | 'NO' }) {
  const [dollars, setDollars] = useState('5');
  const d = parseFloat(dollars) || 0;
  const contracts = Math.floor((d * 100) / priceCents);
  const cost = (contracts * priceCents) / 100;
  const profit = (contracts * netProfit(priceCents)) / 100;
  const total = cost + profit;

  return (
    <div className="mt-3 pt-3 border-t border-[#1e1e1e] space-y-2" onClick={(e) => e.stopPropagation()}>
      <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">If I put in...</div>
      <div className="flex gap-2 flex-wrap">
        {[1, 5, 10, 25, 50].map((amt) => {
          const c = Math.floor((amt * 100) / priceCents);
          const p = (c * netProfit(priceCents)) / 100;
          return (
            <button
              key={amt}
              onClick={() => setDollars(String(amt))}
              className={`flex-1 min-w-[60px] text-center rounded-xl p-2 border transition-all ${
                parseFloat(dollars) === amt
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-[#0d0d0d] border-[#2a2a2a] text-gray-400 hover:border-[#3a3a3a]'
              }`}
            >
              <div className="text-xs font-bold font-mono">${amt}</div>
              <div className="text-[10px] text-gray-500 font-mono">+${p.toFixed(0)}</div>
            </button>
          );
        })}
        <div className="flex items-center bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-3 py-2 min-w-[80px]">
          <span className="text-gray-500 text-xs">$</span>
          <input
            type="number"
            min="1"
            value={dollars}
            onChange={(e) => setDollars(e.target.value)}
            className="w-16 bg-transparent text-white text-xs font-mono focus:outline-none ml-1"
          />
        </div>
      </div>
      {contracts > 0 && (
        <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-xl p-3 grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-[10px] text-gray-600 uppercase">You spend</div>
            <div className="text-white font-mono font-bold">${cost.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-600 uppercase">Win profit</div>
            <div className="text-emerald-400 font-mono font-bold">+${profit.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-600 uppercase">Total back</div>
            <div className="text-white font-mono font-bold">${total.toFixed(2)}</div>
          </div>
        </div>
      )}
      <p className="text-gray-700 text-[10px]">{contracts} contracts · net of fees · lose ${cost.toFixed(2)} if wrong</p>
    </div>
  );
}

// ─── Hunt Card ────────────────────────────────────────────────────────────────

function HuntCard({ opp, rank }: { opp: HuntOpportunity; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const { market: m, side, priceCents, multiplier, isOverlooked, hoursLeft } = opp;
  const sp = spreadCents(m);
  const isUrgent = hoursLeft < 24;
  const isForgotten = m.volume_24h === 0;

  return (
    <div
      onClick={() => setExpanded((p) => !p)}
      className={`bg-[#111111] border rounded-2xl p-4 flex flex-col gap-3 transition-all cursor-pointer ${
        isForgotten
          ? 'border-purple-500/30 hover:border-purple-500/50'
          : isUrgent
          ? 'border-emerald-500/30 hover:border-emerald-500/50'
          : 'border-[#1e1e1e] hover:border-[#2a2a2a]'
      }`}
    >
      {/* Badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold text-gray-700 font-mono">#{rank}</span>
        {isForgotten && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 tracking-wider">
            FORGOTTEN
          </span>
        )}
        {!isForgotten && isOverlooked && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 tracking-wider">
            LOW TRAFFIC
          </span>
        )}
        {isUrgent && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 tracking-wider">
            TODAY
          </span>
        )}
        <span className="ml-auto text-[10px] text-gray-500 font-mono">{fmtClose(m.close_time)}</span>
      </div>

      {/* Title */}
      <div className="text-white text-sm font-semibold leading-snug">{m.title}</div>

      {/* The big number */}
      <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl p-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Buy {side} for</div>
          <div className="text-white font-mono font-bold text-2xl">{priceCents}¢</div>
          <div className="text-gray-600 text-[10px] font-mono">${(priceCents / 100).toFixed(2)} per contract</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">If right, $1 → </div>
          <div className="text-emerald-400 font-mono font-bold text-3xl">${multiplier.toFixed(1)}</div>
          <div className="text-gray-600 text-[10px] font-mono">net of fees</div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 text-[10px] text-gray-600 font-mono">
        <span className="capitalize">{m.category || 'Other'}</span>
        <span>·</span>
        <span>
          {m.volume_24h === 0
            ? <span className="text-purple-400">0 trades today</span>
            : `${m.volume_24h.toLocaleString()} vol 24h`}
        </span>
        <span>·</span>
        <span className={
          sp === null ? 'text-gray-600' :
          sp <= 4 ? 'text-emerald-400' :
          sp <= 10 ? 'text-amber-400' : 'text-red-400'
        }>
          {sp === null ? '--' : sp <= 4 ? 'Liquid' : sp <= 10 ? 'Normal' : 'Thin'}
        </span>
        <span className="ml-auto text-gray-700">{expanded ? '▲' : '▼ calculator'}</span>
      </div>

      {expanded && <ProfitCalc priceCents={priceCents} side={side} />}
    </div>
  );
}

// ─── Arb Card ─────────────────────────────────────────────────────────────────

function ArbCard({ market, arb, rank }: { market: KalshiMarket; arb: StructuralArb; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const cheap = cheapestSide(market);
  const entry = cheap?.price ?? null;

  return (
    <div
      onClick={() => setExpanded((p) => !p)}
      className="bg-[#111111] border border-amber-500/30 hover:border-amber-500/50 rounded-2xl p-4 flex flex-col gap-3 transition-all cursor-pointer"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold text-gray-700 font-mono">#{rank}</span>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 tracking-wider">
          ⚡ {arb.type === 'OVERROUND' ? 'PRICE CONFLICT' : 'LOGIC BREAK'}
        </span>
        <span className="ml-auto text-amber-400 font-mono font-bold text-sm">{arb.edgeCents.toFixed(0)}¢ edge</span>
      </div>
      <div className="text-white text-sm font-semibold leading-snug">{market.title}</div>
      <p className="text-amber-400/70 text-xs leading-relaxed">{arb.description}</p>
      <div className="flex items-center gap-3 text-[10px] text-gray-600 font-mono">
        <span>{fmtClose(market.close_time)}</span>
        <span>·</span>
        <span>{market.volume_24h.toLocaleString()} vol 24h</span>
        <span className="ml-auto text-gray-700">{expanded ? '▲' : '▼ calculator'}</span>
      </div>
      {expanded && entry != null && cheap && (
        <div onClick={(e) => e.stopPropagation()}>
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 mb-3">
            <p className="text-gray-500 text-xs">
              Prices on this platform are mathematically inconsistent. The edge exists regardless of outcome — but always verify both markets settle on the same event criteria.
            </p>
          </div>
          <ProfitCalc priceCents={entry} side={cheap.side} />
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type TabId = 'hunt' | 'arbs';
type DateFilter = 'today' | 'week' | 'all';

export default function EdgePage() {
  const [markets, setMarkets] = useState<KalshiMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('hunt');
  const [dateFilter, setDateFilter] = useState<DateFilter>('week');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [maxPrice, setMaxPrice] = useState(20); // max cent price to show in hunt

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/kalshi/markets');
      const json = await res.json();
      setMarkets(json.markets ?? []);
      setLastUpdated(json.lastUpdated ?? null);
      setError(null);
    } catch {
      setError('Could not reach Kalshi — check connection');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!autoRefresh) return;
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, [autoRefresh, load]);

  // Date filter
  const filtered = markets.filter((m) => {
    if (m.status !== 'open') return false;
    const h = hoursUntilClose(m);
    if (h < 0) return false;
    if (dateFilter === 'today' && h > 24) return false;
    if (dateFilter === 'week' && h > 168) return false;
    return true;
  });

  // Hunt: cheap markets filtered by maxPrice
  const allHunt = buildHuntOpps(filtered).filter((o) => o.priceCents <= maxPrice);
  const topHunt = allHunt.slice(0, 30);

  // Arbs
  const arbMap = detectArbs(filtered);
  const arbMarkets = filtered.filter((m) => arbMap.has(m.ticker));
  // Deduplicate arb groups
  const seenArbGroups = new Set<string>();
  const uniqueArbs: KalshiMarket[] = [];
  for (const m of arbMarkets) {
    const arb = arbMap.get(m.ticker)!;
    const key = arb.markets.map((x: KalshiMarket) => x.ticker).sort().join(',');
    if (!seenArbGroups.has(key)) {
      seenArbGroups.add(key);
      uniqueArbs.push(m);
    }
  }

  const forgottenCount = topHunt.filter((o) => o.market.volume_24h === 0).length;

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Edge Scanner</h1>
          <p className="text-sm text-gray-500 mt-1">
            Finds markets the crowd is sleeping on — cheap entry, big payout if right.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {lastUpdated && (
            <span className="text-[10px] text-gray-700 font-mono">
              {new Date(lastUpdated).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button onClick={load} disabled={loading}
            className="px-3 py-1.5 text-xs font-semibold bg-[#1a1a1a] border border-[#2a2a2a] rounded-full text-gray-300 hover:text-white hover:border-emerald-500/30 transition-all disabled:opacity-50">
            {loading ? 'Scanning...' : '↻ Refresh'}
          </button>
          <button onClick={() => setAutoRefresh((v) => !v)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${autoRefresh ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'text-gray-500 border-[#2a2a2a]'}`}>
            {autoRefresh ? '● Live' : '○ Live'}
          </button>
        </div>
      </div>

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-3 text-center">
            <div className="text-xl font-bold font-mono text-white">{filtered.length}</div>
            <div className="text-[10px] text-gray-600 uppercase tracking-wider mt-0.5">Markets</div>
          </div>
          <div className={`border rounded-xl p-3 text-center ${forgottenCount > 0 ? 'bg-purple-500/5 border-purple-500/20' : 'bg-[#111111] border-[#1e1e1e]'}`}>
            <div className={`text-xl font-bold font-mono ${forgottenCount > 0 ? 'text-purple-400' : 'text-white'}`}>{forgottenCount}</div>
            <div className="text-[10px] text-gray-600 uppercase tracking-wider mt-0.5">Forgotten</div>
          </div>
          <div className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-3 text-center">
            <div className="text-xl font-bold font-mono text-white">{topHunt.length}</div>
            <div className="text-[10px] text-gray-600 uppercase tracking-wider mt-0.5">Under {maxPrice}¢</div>
          </div>
          <div className={`border rounded-xl p-3 text-center ${uniqueArbs.length > 0 ? 'bg-amber-500/5 border-amber-500/20' : 'bg-[#111111] border-[#1e1e1e]'}`}>
            <div className={`text-xl font-bold font-mono ${uniqueArbs.length > 0 ? 'text-amber-400' : 'text-white'}`}>{uniqueArbs.length}</div>
            <div className="text-[10px] text-gray-600 uppercase tracking-wider mt-0.5">Conflicts</div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Tabs */}
        <div className="flex rounded-xl overflow-hidden border border-[#2a2a2a] bg-[#0d0d0d]">
          <button onClick={() => setTab('hunt')}
            className={`px-5 py-2 text-xs font-semibold transition-all ${tab === 'hunt' ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}>
            🎯 The Hunt
          </button>
          <button onClick={() => setTab('arbs')}
            className={`px-5 py-2 text-xs font-semibold transition-all relative ${tab === 'arbs' ? 'bg-amber-500/20 text-amber-400' : 'text-gray-500 hover:text-gray-300'}`}>
            ⚡ Price Conflicts
            {uniqueArbs.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center">
                {uniqueArbs.length}
              </span>
            )}
          </button>
        </div>

        {/* Date filter */}
        <div className="flex rounded-full overflow-hidden border border-[#2a2a2a] bg-[#0d0d0d]">
          {(['today', 'week', 'all'] as DateFilter[]).map((f) => (
            <button key={f} onClick={() => setDateFilter(f)}
              className={`px-3 py-1.5 text-xs font-semibold transition-all ${dateFilter === f ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}>
              {f === 'today' ? 'Today' : f === 'week' ? 'This Week' : 'All'}
            </button>
          ))}
        </div>

        {/* Max price filter — only on hunt tab */}
        {tab === 'hunt' && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-gray-500">Max price:</span>
            <div className="flex rounded-full overflow-hidden border border-[#2a2a2a] bg-[#0d0d0d]">
              {[5, 10, 20, 30].map((p) => (
                <button key={p} onClick={() => setMaxPrice(p)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-all ${maxPrice === p ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}>
                  {p}¢
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-4 animate-pulse h-32" />
          ))}
        </div>
      )}

      {/* Hunt tab */}
      {!loading && tab === 'hunt' && (
        <>
          {topHunt.length === 0 ? (
            <div className="text-center py-16 text-gray-600">
              <div className="text-4xl mb-3">◎</div>
              <div className="text-sm">No markets under {maxPrice}¢ for this timeframe.</div>
              <div className="text-xs mt-1">Try increasing the max price or switching to "All".</div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs text-gray-600">
                  Ranked by: <span className="text-gray-400">multiplier × low traffic × time to close</span> —
                  tap any card to see the profit calculator
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {topHunt.map((opp, i) => (
                  <HuntCard key={opp.market.ticker} opp={opp} rank={i + 1} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Arbs tab */}
      {!loading && tab === 'arbs' && (
        <>
          {uniqueArbs.length === 0 ? (
            <div className="text-center py-16 text-gray-600">
              <div className="text-4xl mb-3">◎</div>
              <div className="text-sm">No price conflicts detected right now.</div>
              <div className="text-xs mt-1">These come and go — check back or switch to All Open.</div>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-600 mb-1">
                Prices on the same platform that don't add up — closest to mathematical edges, but always check settlement criteria.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {uniqueArbs.map((m, i) => (
                  <ArbCard key={m.ticker} market={m} arb={arbMap.get(m.ticker)!} rank={i + 1} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <p className="text-[10px] text-gray-700 text-center pt-2">
        All returns net of fees · Not financial advice · Verify settlement criteria before trading
      </p>
    </div>
  );
}

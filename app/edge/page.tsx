'use client';
import { useEffect, useState, useCallback } from 'react';

// ─── Fee config (update when Kalshi changes their schedule) ──────────────────
// Source: https://kalshi.com/docs/kalshi-fee-schedule.pdf
const FEE_PCT = 0.07;      // 7% of profit on winning side
const FEE_CAP_CENTS = 7;   // capped at 7¢ per contract

function kalshiFee(priceCents: number): number {
  return Math.min(FEE_PCT * (100 - priceCents), FEE_CAP_CENTS);
}

// Net profit (in cents) if you buy at priceCents and win
function netProfit(priceCents: number): number {
  return 100 - priceCents - kalshiFee(priceCents);
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

type DateFilter = 'today' | 'week' | 'all';

// ─── Scoring & ranking ────────────────────────────────────────────────────────

function midPrice(m: KalshiMarket): number | null {
  if (m.yes_bid == null || m.yes_ask == null) return null;
  return (m.yes_bid + m.yes_ask) / 2;
}

function spreadCents(m: KalshiMarket): number | null {
  if (m.yes_bid == null || m.yes_ask == null) return null;
  return m.yes_ask - m.yes_bid;
}

// "Best side": which side to buy — YES if market implies <50% (YES is cheap),
// NO if market implies >50% (NO is cheap). Cheapest side = lowest risk capital.
function bestSide(mid: number): 'YES' | 'NO' {
  return mid <= 50 ? 'YES' : 'NO';
}

function entryPrice(m: KalshiMarket, side: 'YES' | 'NO'): number | null {
  if (side === 'YES') return m.yes_ask;
  if (m.yes_bid == null) return null;
  return 100 - m.yes_bid; // NO ask = 100 - YES bid
}

// Score: structural arbs > high volume + liquid > standard
// Returns 0–100 — higher = show first
function opportunityScore(m: KalshiMarket, isArb: boolean): number {
  let score = 0;
  if (isArb) score += 50;
  const sp = spreadCents(m);
  if (sp !== null && sp <= 4) score += 20;
  else if (sp !== null && sp <= 8) score += 10;
  if (m.volume_24h > 1000) score += 15;
  else if (m.volume_24h > 200) score += 8;
  // Prefer near resolution
  const hoursLeft = (new Date(m.close_time).getTime() - Date.now()) / 3_600_000;
  if (hoursLeft > 0 && hoursLeft < 6) score += 10;
  else if (hoursLeft > 0 && hoursLeft < 24) score += 5;
  return Math.min(score, 100);
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function isThisWeek(iso: string): boolean {
  const d = new Date(iso);
  return d.getTime() - Date.now() < 7 * 86_400_000 && d.getTime() > Date.now();
}

function fmtClose(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = d.getTime() - now;
  if (diff < 0) return 'Resolving soon';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h < 1) return `${m}m left`;
  if (h < 24) return `${h}h ${m}m left`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Structural arb detection ─────────────────────────────────────────────────

interface StructuralArb {
  type: 'OVERROUND' | 'IMPLICATION';
  markets: KalshiMarket[];
  description: string;
  edgeCents: number; // how much is mispriced
}

function detectArbs(markets: KalshiMarket[]): Map<string, StructuralArb> {
  const arbMap = new Map<string, StructuralArb>();

  // Module A: multi-outcome overround
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
    if (askSum > 103) { // >3¢ overround after fees
      const edge = askSum - 100;
      for (const m of withAsks) {
        arbMap.set(m.ticker, {
          type: 'OVERROUND',
          markets: withAsks,
          description: `All outcomes add up to ${askSum}¢ — market is overpriced by ${edge}¢`,
          edgeCents: edge,
        });
      }
    }
  }

  // Module B: implication breaks within a series
  const bySeries = new Map<string, KalshiMarket[]>();
  for (const m of markets) {
    if (!m.series_ticker) continue;
    if (!bySeries.has(m.series_ticker)) bySeries.set(m.series_ticker, []);
    bySeries.get(m.series_ticker)!.push(m);
  }
  for (const [, group] of Array.from(bySeries.entries())) {
    if (group.length < 2) continue;
    const withThresholds = group
      .map((m: KalshiMarket) => {
        const match = m.title.match(/(?:above|at least|>|≥|over)\s*([\d.]+)/i);
        return match ? { m, threshold: parseFloat(match[1]) } : null;
      })
      .filter(Boolean) as { m: KalshiMarket; threshold: number }[];
    if (withThresholds.length < 2) continue;
    withThresholds.sort((a, b) => a.threshold - b.threshold);
    for (let i = 0; i < withThresholds.length - 1; i++) {
      const lower = withThresholds[i];
      const higher = withThresholds[i + 1];
      if (lower.m.yes_ask == null || higher.m.yes_ask == null) continue;
      if (higher.m.yes_ask > lower.m.yes_ask + 2) {
        const edge = higher.m.yes_ask - lower.m.yes_ask;
        arbMap.set(lower.m.ticker, {
          type: 'IMPLICATION',
          markets: [lower.m, higher.m],
          description: `"${higher.m.title}" costs more than "${lower.m.title}" — logically impossible`,
          edgeCents: edge,
        });
        arbMap.set(higher.m.ticker, {
          type: 'IMPLICATION',
          markets: [lower.m, higher.m],
          description: `"${higher.m.title}" costs more than "${lower.m.title}" — logically impossible`,
          edgeCents: edge,
        });
      }
    }
  }

  return arbMap;
}

// ─── Profit Calculator ────────────────────────────────────────────────────────

function ProfitCalc({ priceCents, side }: { priceCents: number; side: 'YES' | 'NO' }) {
  const [dollars, setDollars] = useState('10');
  const d = parseFloat(dollars) || 0;
  const contracts = Math.floor((d * 100) / priceCents);
  const cost = (contracts * priceCents) / 100;
  const profit = (contracts * netProfit(priceCents)) / 100;
  const total = cost + profit;
  const pct = cost > 0 ? (profit / cost) * 100 : 0;

  return (
    <div className="mt-3 pt-3 border-t border-[#1e1e1e]">
      <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Profit Calculator</div>
      <div className="flex items-center gap-2">
        <span className="text-gray-500 text-xs">I put in</span>
        <div className="flex items-center bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-2 py-1">
          <span className="text-gray-500 text-xs">$</span>
          <input
            type="number"
            min="1"
            step="5"
            value={dollars}
            onChange={(e) => setDollars(e.target.value)}
            className="w-16 bg-transparent text-white text-xs font-mono focus:outline-none ml-1"
          />
        </div>
        <span className="text-gray-500 text-xs">on {side}</span>
      </div>
      {contracts > 0 ? (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div className="bg-[#0d0d0d] rounded-lg p-2 text-center">
            <div className="text-gray-600 text-[10px] uppercase">Contracts</div>
            <div className="text-white font-mono font-bold text-sm">{contracts}</div>
          </div>
          <div className="bg-[#0d0d0d] rounded-lg p-2 text-center">
            <div className="text-gray-600 text-[10px] uppercase">Win profit</div>
            <div className="text-emerald-400 font-mono font-bold text-sm">+${profit.toFixed(2)}</div>
          </div>
          <div className="bg-[#0d0d0d] rounded-lg p-2 text-center">
            <div className="text-gray-600 text-[10px] uppercase">Total back</div>
            <div className="text-white font-mono font-bold text-sm">${total.toFixed(2)}</div>
          </div>
        </div>
      ) : (
        <p className="text-gray-600 text-xs mt-2">Enter an amount to see potential returns.</p>
      )}
      {contracts > 0 && (
        <p className="text-gray-700 text-[10px] mt-1.5">
          {pct.toFixed(0)}% return if {side} wins · {contracts} contracts at {priceCents}¢ · net of fees
        </p>
      )}
    </div>
  );
}

// ─── Opportunity Card ─────────────────────────────────────────────────────────

function OpportunityCard({
  market,
  arb,
  rank,
}: {
  market: KalshiMarket;
  arb: StructuralArb | undefined;
  rank: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const mid = midPrice(market);
  const sp = spreadCents(market);
  const side = mid != null ? bestSide(mid) : 'YES';
  const entry = entryPrice(market, side);
  const impliedPct = mid != null ? (side === 'YES' ? mid : 100 - mid) : null;
  const winProb = impliedPct != null ? (side === 'YES' ? mid! : 100 - mid!) : null;
  const profit = entry != null ? netProfit(entry) : null;

  const isArb = !!arb;
  const hoursLeft = (new Date(market.close_time).getTime() - Date.now()) / 3_600_000;
  const urgentSoon = hoursLeft > 0 && hoursLeft < 3;

  const borderClass = isArb
    ? 'border-amber-500/40 hover:border-amber-500/70'
    : urgentSoon
    ? 'border-emerald-500/30 hover:border-emerald-500/50'
    : 'border-[#1e1e1e] hover:border-[#2a2a2a]';

  const spreadLabel = sp === null ? '--' : sp <= 4 ? 'Liquid' : sp <= 10 ? 'Normal' : 'Thin';
  const spreadColor = sp === null ? 'text-gray-600' : sp <= 4 ? 'text-emerald-400' : sp <= 10 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className={`bg-[#111111] border ${borderClass} rounded-2xl p-4 flex flex-col gap-3 transition-all cursor-pointer`}
      onClick={() => setExpanded((p) => !p)}>

      {/* Top badges row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold text-gray-600 font-mono">#{rank}</span>
        {isArb && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-wider">
            {arb.type === 'OVERROUND' ? '⚡ Price Conflict' : '⚡ Logic Break'}
          </span>
        )}
        {urgentSoon && !isArb && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
            Resolves Soon
          </span>
        )}
        <span className="ml-auto text-[10px] text-gray-600 font-mono">{fmtClose(market.close_time)}</span>
      </div>

      {/* Market title */}
      <div className="text-white text-sm font-semibold leading-snug">{market.title}</div>

      {/* Key numbers */}
      <div className="flex items-end gap-4 flex-wrap">
        {/* Win probability */}
        <div>
          <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Market says</div>
          <div className="flex items-baseline gap-1">
            <span className={`font-mono font-bold text-2xl ${side === 'YES' ? 'text-emerald-400' : 'text-red-400'}`}>
              {winProb != null ? `${winProb.toFixed(0)}%` : '--'}
            </span>
            <span className="text-gray-500 text-xs">chance of {side}</span>
          </div>
        </div>

        {/* Entry */}
        <div>
          <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Buy {side} for</div>
          <div className="font-mono font-bold text-xl text-white">
            {entry != null ? `${entry}¢` : '--'}
          </div>
          <div className="text-[10px] text-gray-600 font-mono">${entry != null ? (entry / 100).toFixed(2) : '--'} per contract</div>
        </div>

        {/* Payout */}
        <div>
          <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Win payout</div>
          <div className="font-mono font-bold text-xl text-emerald-400">
            {profit != null ? `${profit.toFixed(0)}¢` : '--'}
          </div>
          <div className="text-[10px] text-gray-600 font-mono">net of fees</div>
        </div>

        {/* Spread / liquidity */}
        <div className="ml-auto text-right">
          <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Liquidity</div>
          <div className={`font-mono font-semibold text-sm ${spreadColor}`}>{spreadLabel}</div>
          <div className="text-[10px] text-gray-600 font-mono">{sp != null ? `${sp}¢ spread` : '--'}</div>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[10px] text-gray-600 font-mono pt-1 border-t border-[#1e1e1e]">
        <span>{market.category}</span>
        <span>·</span>
        <span>24h vol: {market.volume_24h.toLocaleString()}</span>
        {isArb && <span className="text-amber-400 ml-auto">{arb.edgeCents.toFixed(0)}¢ edge</span>}
        <span className={`${isArb ? '' : 'ml-auto'} text-gray-700`}>{expanded ? '▲ less' : '▼ more'}</span>
      </div>

      {/* Expanded: arb detail + calculator */}
      {expanded && (
        <div onClick={(e) => e.stopPropagation()}>
          {isArb && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 mb-3">
              <div className="text-amber-400 text-xs font-semibold mb-1">Price Inconsistency Detected</div>
              <p className="text-gray-400 text-xs leading-relaxed">{arb.description}</p>
              <p className="text-gray-600 text-[10px] mt-2">
                Always verify these share the same settlement source before trading. Structural edges can disappear quickly.
              </p>
            </div>
          )}
          {entry != null && <ProfitCalc priceCents={entry} side={side} />}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EdgePage() {
  const [markets, setMarkets] = useState<KalshiMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

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

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, [autoRefresh, load]);

  // Filter
  const filtered = markets.filter((m) => {
    if (m.status !== 'open') return false;
    if (dateFilter === 'today' && !isToday(m.close_time)) return false;
    if (dateFilter === 'week' && !isThisWeek(m.close_time)) return false;
    if (categoryFilter !== 'all' && m.category !== categoryFilter) return false;
    return true;
  });

  // Detect arbs across ALL filtered markets
  const arbMap = detectArbs(filtered);

  // Rank
  const ranked = [...filtered]
    .filter((m) => midPrice(m) != null)
    .sort((a, b) => {
      const sa = opportunityScore(a, arbMap.has(a.ticker));
      const sb = opportunityScore(b, arbMap.has(b.ticker));
      return sb - sa;
    });

  const arbCount = new Set(Array.from(arbMap.keys()).map((k) => {
    const arb = arbMap.get(k)!;
    return arb.markets.map((m: KalshiMarket) => m.ticker).join(',');
  })).size;

  // Unique categories
  const categories = ['all', ...Array.from(new Set(markets.map((m) => m.category).filter(Boolean))).sort()];

  const topArbs = ranked.filter((m) => arbMap.has(m.ticker));
  const topOpps = ranked.filter((m) => !arbMap.has(m.ticker)).slice(0, 20);

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Edge Scanner</h1>
          <p className="text-sm text-gray-500 mt-1">
            Best Kalshi opportunities right now — ranked automatically.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {lastUpdated && (
            <span className="text-[10px] text-gray-700 font-mono">
              Updated {new Date(lastUpdated).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-semibold bg-[#1a1a1a] border border-[#2a2a2a] rounded-full text-gray-300 hover:text-white hover:border-emerald-500/30 transition-all disabled:opacity-50"
          >
            {loading ? 'Scanning...' : '↻ Refresh'}
          </button>
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${
              autoRefresh
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'text-gray-500 border-[#2a2a2a]'
            }`}
          >
            {autoRefresh ? '● Auto' : '○ Auto'}
          </button>
        </div>
      </div>

      {/* Stats row */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-3 text-center">
            <div className="text-2xl font-bold font-mono text-white">{ranked.length}</div>
            <div className="text-[10px] text-gray-600 uppercase tracking-wider mt-0.5">Markets scanned</div>
          </div>
          <div className={`border rounded-xl p-3 text-center ${arbCount > 0 ? 'bg-amber-500/5 border-amber-500/20' : 'bg-[#111111] border-[#1e1e1e]'}`}>
            <div className={`text-2xl font-bold font-mono ${arbCount > 0 ? 'text-amber-400' : 'text-white'}`}>{arbCount}</div>
            <div className="text-[10px] text-gray-600 uppercase tracking-wider mt-0.5">Price conflicts</div>
          </div>
          <div className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-3 text-center">
            <div className="text-2xl font-bold font-mono text-white">{topOpps.length}</div>
            <div className="text-[10px] text-gray-600 uppercase tracking-wider mt-0.5">Opportunities</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Date filter */}
        <div className="flex rounded-full overflow-hidden border border-[#2a2a2a] bg-[#0d0d0d]">
          {(['today', 'week', 'all'] as DateFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setDateFilter(f)}
              className={`px-4 py-1.5 text-xs font-semibold transition-all ${
                dateFilter === f
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {f === 'today' ? 'Today' : f === 'week' ? 'This Week' : 'All Open'}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-1.5 text-xs font-semibold bg-[#0d0d0d] border border-[#2a2a2a] rounded-full text-gray-300 focus:outline-none focus:border-emerald-500/40"
        >
          {categories.map((c) => (
            <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-4 animate-pulse h-36" />
          ))}
        </div>
      )}

      {!loading && ranked.length === 0 && !error && (
        <div className="text-center py-16 text-gray-600">
          <div className="text-4xl mb-3">◎</div>
          <div className="text-sm">No markets found for this filter.</div>
          <div className="text-xs mt-1">Try switching to "This Week" or "All Open".</div>
        </div>
      )}

      {/* Price conflict arbs — pinned at top */}
      {!loading && topArbs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-xs uppercase tracking-wider font-semibold text-amber-400">
              ⚡ Price Conflicts
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {topArbs.length}
            </span>
            <span className="text-[10px] text-gray-600">Markets where prices don't add up — closest to risk-free</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {topArbs.map((m, i) => (
              <OpportunityCard key={m.ticker} market={m} arb={arbMap.get(m.ticker)} rank={i + 1} />
            ))}
          </div>
        </div>
      )}

      {/* Top opportunities */}
      {!loading && topOpps.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-xs uppercase tracking-wider font-semibold text-white">
              Top Opportunities
            </h2>
            <span className="text-[10px] text-gray-600">Best liquidity + volume + resolving soonest · tap a card to see payout calculator</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {topOpps.map((m, i) => (
              <OpportunityCard key={m.ticker} market={m} arb={arbMap.get(m.ticker)} rank={topArbs.length + i + 1} />
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-gray-700 text-center pt-2">
        All payouts shown net of fees · Not financial advice · Always verify settlement criteria before trading
      </p>
    </div>
  );
}

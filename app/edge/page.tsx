'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { ScoredOpportunity } from '@/app/api/edge/score/route';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DebugSourceStat {
  fetched: number;
  scored: number;
  rejected: number;
  error: string | null;
  active: boolean;
}

interface DebugInfo {
  sources: {
    kalshi: DebugSourceStat;
    polymarket: DebugSourceStat;
    manifold: DebugSourceStat;
    predictit: DebugSourceStat;
  };
  thresholdMode: 'normal' | 'adaptive';
  scoreFloor: number;
  tier1Min: number;
  tier2Min: number;
  totalFetched: number;
  totalScored: number;
  totalRejected: number;
  cacheAge: number;
}

interface EdgeResponse {
  opportunities: ScoredOpportunity[];
  debug: DebugInfo;
  fetchFailed?: boolean;
  fromCache?: boolean;
  cacheAge?: number;
}

// ─── Snapshot (localStorage price comparison) ─────────────────────────────────

const SNAPSHOT_KEY = 'tradevi-edge-snapshot';

interface Snapshot {
  ts: number;
  prices: Record<string, number>;
}

function readSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Snapshot;
  } catch {
    return null;
  }
}

function saveSnapshot(opportunities: ScoredOpportunity[]) {
  const prices: Record<string, number> = {};
  for (const o of opportunities) prices[o.id] = o.pricePct;
  const snap: Snapshot = { ts: Date.now(), prices };
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
  } catch {
    // ignore storage errors
  }
}

function annotateWithPriceChange(
  opportunities: ScoredOpportunity[],
  snapshot: Snapshot | null,
): ScoredOpportunity[] {
  if (!snapshot) return opportunities;
  return opportunities.map(o => ({
    ...o,
    priceChange: snapshot.prices[o.id] != null
      ? o.pricePct - snapshot.prices[o.id]
      : null,
  }));
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIER_COLORS = {
  1: { border: 'border-emerald-500/40', bg: 'bg-emerald-500/5', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  2: { border: 'border-amber-500/30', bg: 'bg-amber-500/5', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  3: { border: 'border-[#1e1e1e]', bg: '', badge: 'bg-[#1a1a1a] text-gray-400 border-[#2a2a2a]' },
} as const;

const SOURCE_COLORS: Record<string, string> = {
  kalshi: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
  polymarket: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  manifold: 'text-pink-400 border-pink-500/30 bg-pink-500/10',
  predictit: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
};

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const color = score >= 30 ? 'bg-emerald-500' : score >= 15 ? 'bg-amber-400' : 'bg-gray-600';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-[#1e1e1e] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className={`text-xs font-mono font-bold ${score >= 30 ? 'text-emerald-400' : score >= 15 ? 'text-amber-400' : 'text-gray-500'}`}>
        {score}
      </span>
    </div>
  );
}

// ─── Price change indicator ───────────────────────────────────────────────────

function PriceChangeIndicator({ priceChange, snapshotTs }: { priceChange: number | null; snapshotTs: number | null }) {
  if (priceChange === null) return null;

  const ageMin = snapshotTs ? Math.round((Date.now() - snapshotTs) / 60_000) : null;

  const indicator = priceChange > 1
    ? { icon: '▲', text: `+${priceChange.toFixed(1)}`, color: 'text-emerald-400' }
    : priceChange < -1
    ? { icon: '▼', text: priceChange.toFixed(1), color: 'text-red-400' }
    : { icon: '→', text: null, color: 'text-gray-500' };

  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-xs font-mono font-semibold ${indicator.color}`}>
        {indicator.icon}{indicator.text ? ` ${indicator.text}` : ''}
      </span>
      {ageMin !== null && (
        <span className="text-[10px] text-gray-600">vs {ageMin}m ago</span>
      )}
    </div>
  );
}

// ─── Opportunity card ─────────────────────────────────────────────────────────

function OpportunityCard({ opp, snapshotTs }: { opp: ScoredOpportunity; snapshotTs: number | null }) {
  const tc = TIER_COLORS[opp.tier];
  const sc = SOURCE_COLORS[opp.source] ?? 'text-gray-400 border-gray-500/30 bg-gray-500/10';

  const daysLeft = (new Date(opp.closesAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  const closesLabel = daysLeft < 1
    ? `< 1 day`
    : daysLeft < 7
    ? `${Math.ceil(daysLeft)}d`
    : daysLeft < 60
    ? `${Math.ceil(daysLeft / 7)}w`
    : `${Math.ceil(daysLeft / 30)}mo`;

  return (
    <div className={`${tc.bg} border ${tc.border} rounded-2xl p-4 flex flex-col gap-3 transition-all hover:brightness-110`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold leading-snug line-clamp-2">{opp.title}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${sc}`}>
              {opp.sourceLabel}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${tc.badge}`}>
              T{opp.tier}
            </span>
            {opp.arbitrageGap !== null && opp.arbitrageGap >= 5 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-rose-500/20 text-rose-300 border-rose-500/40">
                Arb {opp.arbitrageGap.toFixed(0)}¢ vs {opp.arbitrageSource}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl font-bold font-mono text-white">{opp.pricePct.toFixed(0)}%</div>
          <div className="text-[10px] text-gray-500 font-mono">YES prob</div>
        </div>
      </div>

      {/* Score bar */}
      <ScoreBar score={opp.score} />

      {/* Price change */}
      <PriceChangeIndicator priceChange={opp.priceChange} snapshotTs={snapshotTs} />

      {/* Signals */}
      {opp.signals.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {opp.signals.map((s, i) => (
            <span key={i} className="text-[10px] text-gray-400 bg-[#1a1a1a] border border-[#2a2a2a] px-1.5 py-0.5 rounded">
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Footer stats */}
      <div className="flex items-center gap-3 text-[10px] font-mono text-gray-600 pt-1 border-t border-[#1e1e1e] flex-wrap">
        {opp.volume > 0 && (
          <span>Vol {opp.volume >= 1e6 ? `$${(opp.volume/1e6).toFixed(1)}M` : opp.volume >= 1e3 ? `$${(opp.volume/1e3).toFixed(0)}K` : `$${opp.volume}`}</span>
        )}
        <span>Closes {closesLabel}</span>
        {opp.openInterest > 0 && (
          <span>OI {opp.openInterest >= 1e6 ? `$${(opp.openInterest/1e6).toFixed(1)}M` : `$${(opp.openInterest/1e3).toFixed(0)}K`}</span>
        )}
      </div>
    </div>
  );
}

// ─── Debug panel ─────────────────────────────────────────────────────────────

function DebugPanel({ debug }: { debug: DebugInfo }) {
  const sourceKeys = ['kalshi', 'polymarket', 'manifold', 'predictit'] as const;

  return (
    <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-4 font-mono text-xs space-y-3">
      <div className="text-gray-400 font-semibold text-[11px] uppercase tracking-widest mb-2">Data Sources</div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-gray-600">
              <th className="pr-4 pb-1">Source</th>
              <th className="pr-4 pb-1">Status</th>
              <th className="pr-4 pb-1 text-right">Fetched</th>
              <th className="pr-4 pb-1 text-right">Scored</th>
              <th className="pr-4 pb-1 text-right">Rejected</th>
              <th className="pb-1">Error</th>
            </tr>
          </thead>
          <tbody>
            {sourceKeys.map(key => {
              const s = debug.sources[key];
              return (
                <tr key={key} className="border-t border-[#1e1e1e]">
                  <td className="pr-4 py-1 capitalize text-gray-300">{key}</td>
                  <td className="pr-4 py-1">
                    {s.active
                      ? <span className="text-emerald-400">✓ Live</span>
                      : s.error
                      ? <span className="text-red-400">✗ Error</span>
                      : <span className="text-gray-600">— Empty</span>
                    }
                  </td>
                  <td className="pr-4 py-1 text-right text-gray-400">{s.fetched.toLocaleString()}</td>
                  <td className="pr-4 py-1 text-right text-gray-400">{s.scored.toLocaleString()}</td>
                  <td className="pr-4 py-1 text-right text-gray-400">{s.rejected.toLocaleString()}</td>
                  <td className="py-1 text-gray-600 truncate max-w-[200px]">
                    {s.error ? <span className="text-red-400/70">{s.error.slice(0, 60)}</span> : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-gray-500 text-[11px] flex flex-wrap gap-3 pt-1 border-t border-[#1e1e1e]">
        <span>
          Threshold: <span className="text-gray-300">{debug.thresholdMode === 'normal' ? 'Normal' : 'Adaptive'}</span>{' '}
          (floor={debug.scoreFloor}, T1≥{debug.tier1Min}, T2≥{debug.tier2Min})
        </span>
        <span>·</span>
        <span>Total: <span className="text-gray-300">{debug.totalFetched.toLocaleString()}</span> fetched</span>
        <span>·</span>
        <span><span className="text-gray-300">{debug.totalScored.toLocaleString()}</span> scored</span>
        <span>·</span>
        <span><span className="text-gray-300">{debug.totalRejected.toLocaleString()}</span> rejected</span>
        {debug.cacheAge > 0 && (
          <>
            <span>·</span>
            <span>Cache: <span className="text-amber-400">{Math.round(debug.cacheAge / 1000)}s old</span></span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-4 h-40 animate-pulse" />
      ))}
    </div>
  );
}

// ─── Hero header ──────────────────────────────────────────────────────────────

const ACCENT = 'text-emerald-400';

function HeroCard({ total, tier1, tier2, sources }: { total: number; tier1: number; tier2: number; sources: number }) {
  return (
    <div className="bg-gradient-to-br from-[#111111] to-[#0d1a12] border border-emerald-500/20 rounded-2xl p-5 flex flex-wrap gap-6">
      <div>
        <div className={`text-3xl font-bold font-mono ${ACCENT}`}>{total}</div>
        <div className="text-xs text-gray-500 mt-0.5">Opportunities</div>
      </div>
      <div>
        <div className="text-3xl font-bold font-mono text-white">{tier1}</div>
        <div className="text-xs text-gray-500 mt-0.5">Tier 1 (high score)</div>
      </div>
      <div>
        <div className="text-3xl font-bold font-mono text-white">{tier2}</div>
        <div className="text-xs text-gray-500 mt-0.5">Tier 2</div>
      </div>
      <div>
        <div className="text-3xl font-bold font-mono text-white">{sources}</div>
        <div className="text-xs text-gray-500 mt-0.5">Active sources</div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EdgePage() {
  const [opportunities, setOpportunities] = useState<ScoredOpportunity[]>([]);
  const [debug, setDebug] = useState<DebugInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [snapshotTs, setSnapshotTs] = useState<number | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Read snapshot BEFORE fetch
      if (snapshotRef.current === null) {
        snapshotRef.current = readSnapshot();
        if (snapshotRef.current) setSnapshotTs(snapshotRef.current.ts);
      }

      const res = await fetch('/api/edge/score');
      const json: EdgeResponse = await res.json();

      // Annotate with price change from snapshot
      const annotated = annotateWithPriceChange(json.opportunities, snapshotRef.current);

      // Save new snapshot for next load
      saveSnapshot(json.opportunities);
      // Update ref for subsequent refreshes
      snapshotRef.current = readSnapshot();

      setOpportunities(annotated);
      setDebug(json.debug ?? null);
      setFetchFailed(json.fetchFailed ?? false);
      setFromCache(json.fromCache ?? false);
    } catch {
      setFetchFailed(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const tier1 = opportunities.filter(o => o.tier === 1);
  const tier2 = opportunities.filter(o => o.tier === 2);
  const tier3 = opportunities.filter(o => o.tier === 3);
  const activeSources = debug
    ? Object.values(debug.sources).filter(s => s.active).length
    : 0;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Edge Scanner</h1>
          <p className="text-sm text-gray-500 mt-1">
            Live prediction market opportunities · Kalshi · Polymarket · Manifold · PredictIt
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading && opportunities.length > 0 && (
            <span className="text-xs text-amber-400/70 animate-pulse">Refreshing…</span>
          )}
          <button
            onClick={() => setShowDebug(p => !p)}
            className={`px-3 py-1.5 text-xs font-semibold border rounded-full transition-all ${
              showDebug
                ? 'bg-[#1a1a1a] border-emerald-500/30 text-emerald-400'
                : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-500 hover:text-gray-300 hover:border-[#3a3a3a]'
            }`}
          >
            ⚙ Debug
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-1.5 text-xs font-semibold bg-[#1a1a1a] border border-[#2a2a2a] rounded-full text-gray-300 hover:border-emerald-500/30 hover:text-white transition-all disabled:opacity-50"
          >
            {loading ? 'Scanning…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Cache banner */}
      {fromCache && !loading && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2 text-xs text-amber-400">
          Serving cached data — live sources unavailable
        </div>
      )}

      {/* Hero stats */}
      {(opportunities.length > 0 || !loading) && (
        <HeroCard
          total={opportunities.length}
          tier1={tier1.length}
          tier2={tier2.length}
          sources={activeSources}
        />
      )}

      {/* Debug panel */}
      {showDebug && debug && <DebugPanel debug={debug} />}

      {/* All sources failed, no cache */}
      {fetchFailed && !fromCache && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-5 space-y-3">
          <p className="text-red-400 font-semibold">All data sources failed</p>
          {debug && (
            <div className="space-y-1">
              {(['kalshi', 'polymarket', 'manifold', 'predictit'] as const).map(key => {
                const s = debug.sources[key];
                return s.error ? (
                  <div key={key} className="text-xs text-red-400/70 font-mono">
                    {key}: {s.error}
                  </div>
                ) : null;
              })}
            </div>
          )}
        </div>
      )}

      {/* Loading skeleton (only if no data yet) */}
      {loading && opportunities.length === 0 && <Skeleton />}

      {/* Empty state: fetched OK but nothing passed threshold */}
      {!loading && !fetchFailed && debug && debug.totalFetched > 0 && opportunities.length === 0 && (
        <div className="text-center py-16 text-gray-600">
          <div className="text-4xl mb-3">🔍</div>
          <div className="text-base font-semibold">No opportunities above threshold</div>
          <div className="text-xs mt-2">
            {debug.totalFetched.toLocaleString()} markets scanned · score floor = {debug.scoreFloor}
          </div>
        </div>
      )}

      {/* Tier 1 */}
      {tier1.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 pb-1 border-b border-emerald-500/20">
            <h2 className="text-white font-bold text-base">Tier 1 — High Conviction</h2>
            <span className="text-xs text-gray-600">(score ≥ {debug?.tier1Min ?? 30})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tier1.map(o => <OpportunityCard key={o.id} opp={o} snapshotTs={snapshotTs} />)}
          </div>
        </section>
      )}

      {/* Tier 2 */}
      {tier2.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 pb-1 border-b border-amber-500/20">
            <h2 className="text-white font-bold text-base">Tier 2 — Noteworthy</h2>
            <span className="text-xs text-gray-600">(score {debug?.tier2Min ?? 15}–{(debug?.tier1Min ?? 30) - 1})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tier2.map(o => <OpportunityCard key={o.id} opp={o} snapshotTs={snapshotTs} />)}
          </div>
        </section>
      )}

      {/* Tier 3 */}
      {tier3.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 pb-1 border-b border-[#1e1e1e]">
            <h2 className="text-white font-bold text-base">Tier 3 — Watchlist</h2>
            <span className="text-xs text-gray-600">(score {debug?.scoreFloor ?? 4}–{(debug?.tier2Min ?? 15) - 1})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tier3.map(o => <OpportunityCard key={o.id} opp={o} snapshotTs={snapshotTs} />)}
          </div>
        </section>
      )}

      <p className="text-xs text-gray-700 pb-4">
        Scores based on: probability extremes, near-50 uncertainty, volume, bid-ask spread, time decay, open interest, payoff asymmetry.
        Cross-source arbitrage gaps identified via Jaccard title similarity ≥ 0.35.
        Not financial advice — verify on source platform before trading.
      </p>
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';

interface ScoreBreakdown {
  priceConflict: number;
  forgottenMarket: number;
  infoGap: number;
  glitch: number;
  overreaction: number;
  eventArbitrage: number;
  crowdEmotion: number;
  total: number;
}

interface Opportunity {
  id: string;
  source: 'kalshi' | 'polymarket' | 'cross';
  title: string;
  category: string;
  currentPricePct: number;
  fairValuePct: number;
  edgePct: number;
  direction: 'YES' | 'NO';
  tier: 1 | 2 | 3;
  riskLevel: 'Low' | 'Medium' | 'High';
  catalyst: string;
  reasonCrowdIsWrong: string;
  suggestedEntry: string;
  suggestedExit: string;
  volume: number;
  closesAt: string;
  scores: ScoreBreakdown;
  heroType?: 'mispriced' | 'forgotten' | 'breaking' | 'wrong_crowd';
}

const HERO_CONFIG = {
  mispriced: {
    icon: '🎯',
    label: 'Mispriced Probability',
    desc: 'Biggest gap between market odds and estimated fair value',
    accent: 'emerald' as const,
  },
  forgotten: {
    icon: '👀',
    label: "Nobody's Watching",
    desc: 'Lowest attention + highest upcoming catalyst',
    accent: 'blue' as const,
  },
  breaking: {
    icon: '⚡',
    label: 'Breaking Before News',
    desc: 'Unusual price divergence before mainstream coverage',
    accent: 'yellow' as const,
  },
  wrong_crowd: {
    icon: '🔥',
    label: 'Crowd Is Wrong',
    desc: 'Emotional overreaction — smart money disagrees',
    accent: 'red' as const,
  },
};

const ACCENT = {
  emerald: {
    border: 'border-emerald-500/40',
    iconBg: 'bg-emerald-500/15',
    text: 'text-emerald-400',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  blue: {
    border: 'border-blue-500/40',
    iconBg: 'bg-blue-500/15',
    text: 'text-blue-400',
    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
  yellow: {
    border: 'border-yellow-500/40',
    iconBg: 'bg-yellow-500/15',
    text: 'text-yellow-400',
    badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  },
  red: {
    border: 'border-red-500/40',
    iconBg: 'bg-red-500/15',
    text: 'text-red-400',
    badge: 'bg-red-500/20 text-red-300 border-red-500/30',
  },
};

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

function daysUntil(dateStr: string): string {
  try {
    const ms = new Date(dateStr).getTime() - Date.now();
    const d = Math.floor(ms / 86400000);
    if (d < 0) return 'Expired';
    if (d === 0) return 'Today';
    if (d === 1) return '1 day';
    return `${d} days`;
  } catch {
    return '?';
  }
}

function ScoreBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-500 w-4 text-right">{value}</span>
    </div>
  );
}

function HeroCard({ opp }: { opp: Opportunity }) {
  const heroType = opp.heroType as keyof typeof HERO_CONFIG;
  const cfg = HERO_CONFIG[heroType];
  const ac = ACCENT[cfg.accent];

  return (
    <div className={`rounded-xl border ${ac.border} p-4 flex flex-col gap-3`}
      style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg ${ac.iconBg} flex items-center justify-center text-lg flex-shrink-0`}>
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-semibold ${ac.text} mb-0.5`}>{cfg.label}</div>
          <div className="text-[10px] text-gray-500">{cfg.desc}</div>
        </div>
        <div className={`text-xs font-bold px-2 py-0.5 rounded-full border ${ac.badge} whitespace-nowrap`}>
          {opp.direction} +{opp.edgePct.toFixed(1)}%
        </div>
      </div>

      <div className="text-sm text-gray-200 font-medium leading-tight line-clamp-2">{opp.title}</div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white/3 rounded-lg p-2 text-center">
          <div className="text-[10px] text-gray-600 mb-0.5">Market Says</div>
          <div className="text-base font-bold text-white">{opp.currentPricePct.toFixed(0)}¢</div>
        </div>
        <div className="bg-white/3 rounded-lg p-2 text-center">
          <div className="text-[10px] text-gray-600 mb-0.5">Fair Value</div>
          <div className={`text-base font-bold ${ac.text}`}>{opp.fairValuePct.toFixed(0)}¢</div>
        </div>
        <div className="bg-white/3 rounded-lg p-2 text-center">
          <div className="text-[10px] text-gray-600 mb-0.5">Edge Score</div>
          <div className="text-base font-bold text-white">{opp.scores.total}</div>
        </div>
      </div>

      <div className="text-[11px] text-gray-400 leading-relaxed">{opp.catalyst}</div>
    </div>
  );
}

function OpportunityCard({ opp, rank }: { opp: Opportunity; rank: number }) {
  const [expanded, setExpanded] = useState(false);

  const tierColor = opp.tier === 1
    ? 'text-emerald-400 border-emerald-500/40'
    : opp.tier === 2
    ? 'text-blue-400 border-blue-500/40'
    : 'text-gray-400 border-gray-600/40';

  const riskColor = opp.riskLevel === 'Low'
    ? 'text-emerald-400 bg-emerald-500/10'
    : opp.riskLevel === 'Medium'
    ? 'text-yellow-400 bg-yellow-500/10'
    : 'text-red-400 bg-red-500/10';

  const dirColor = opp.direction === 'YES' ? 'text-emerald-400' : 'text-red-400';

  return (
    <div
      className="rounded-xl border border-white/5 overflow-hidden cursor-pointer hover:border-white/10 transition-all"
      style={{ background: '#111111' }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="text-xs text-gray-700 w-5 flex-shrink-0 text-right">{rank}</div>

        <div className="flex-1 min-w-0">
          <div className="text-sm text-gray-200 font-medium leading-tight truncate">{opp.title}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-gray-600">{opp.category}</span>
            <span className="text-[10px] text-gray-700">·</span>
            <span className="text-[10px] text-gray-600">{formatVolume(opp.volume)} vol</span>
            <span className="text-[10px] text-gray-700">·</span>
            <span className="text-[10px] text-gray-600">{daysUntil(opp.closesAt)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            <div className="text-xs">
              <span className="text-gray-300 font-medium">{opp.currentPricePct.toFixed(0)}¢</span>
              <span className="text-gray-700 mx-1">→</span>
              <span className={`font-semibold ${dirColor}`}>{opp.fairValuePct.toFixed(0)}¢</span>
            </div>
            <div className={`text-[10px] font-bold ${dirColor}`}>
              {opp.direction} +{opp.edgePct.toFixed(1)}%
            </div>
          </div>

          <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${tierColor}`}>
            T{opp.tier}
          </div>

          <div className="text-gray-600 text-[10px]">{expanded ? '▲' : '▼'}</div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-white/5 pt-3 grid grid-cols-1 gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/3 rounded-lg p-3">
              <div className="text-[10px] text-gray-600 mb-1 uppercase tracking-wide">Catalyst</div>
              <div className="text-xs text-gray-300">{opp.catalyst}</div>
            </div>
            <div className="bg-white/3 rounded-lg p-3">
              <div className="text-[10px] text-gray-600 mb-1 uppercase tracking-wide">Why Crowd Is Wrong</div>
              <div className="text-xs text-gray-300">{opp.reasonCrowdIsWrong}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-lg p-3">
              <div className="text-[10px] text-emerald-700 mb-1 uppercase tracking-wide">Suggested Entry</div>
              <div className="text-xs text-emerald-300">{opp.suggestedEntry}</div>
            </div>
            <div className="bg-blue-500/5 border border-blue-500/15 rounded-lg p-3">
              <div className="text-[10px] text-blue-700 mb-1 uppercase tracking-wide">Suggested Exit</div>
              <div className="text-xs text-blue-300">{opp.suggestedExit}</div>
            </div>
          </div>

          <div className="bg-white/3 rounded-lg p-3">
            <div className="text-[10px] text-gray-600 mb-2 uppercase tracking-wide">Score Breakdown</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <div>
                <div className="text-[10px] text-gray-500 mb-0.5">Price Conflict</div>
                <ScoreBar value={opp.scores.priceConflict} max={25} color="bg-emerald-500" />
              </div>
              <div>
                <div className="text-[10px] text-gray-500 mb-0.5">Forgotten Market</div>
                <ScoreBar value={opp.scores.forgottenMarket} max={20} color="bg-blue-500" />
              </div>
              <div>
                <div className="text-[10px] text-gray-500 mb-0.5">Info Gap</div>
                <ScoreBar value={opp.scores.infoGap} max={20} color="bg-purple-500" />
              </div>
              <div>
                <div className="text-[10px] text-gray-500 mb-0.5">Glitch Detection</div>
                <ScoreBar value={opp.scores.glitch} max={15} color="bg-red-500" />
              </div>
              <div>
                <div className="text-[10px] text-gray-500 mb-0.5">Overreaction</div>
                <ScoreBar value={opp.scores.overreaction} max={10} color="bg-orange-500" />
              </div>
              <div>
                <div className="text-[10px] text-gray-500 mb-0.5">Cross-Market Arb</div>
                <ScoreBar value={opp.scores.eventArbitrage} max={5} color="bg-yellow-500" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className={`text-[10px] px-2 py-0.5 rounded ${riskColor}`}>{opp.riskLevel} Risk</span>
            <span className="text-[10px] text-gray-600">Kalshi</span>
            <span className="text-[10px] text-gray-600">Closes {daysUntil(opp.closesAt)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EdgePage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState('');
  const [meta, setMeta] = useState<{ kalshiFetched: number; polymarketFetched: number; scored: number; returned: number } | null>(null);
  const [tierFilter, setTierFilter] = useState<0 | 1 | 2 | 3>(0);
  const [catFilter, setCatFilter] = useState('All');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/edge/score', { cache: 'no-store' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const j = await resp.json();
      setOpportunities(j.opportunities ?? []);
      setMeta(j.meta ?? null);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const heroes = opportunities.filter((o) => o.heroType);
  const heroOrder = ['mispriced', 'forgotten', 'breaking', 'wrong_crowd'] as const;
  const heroCards = heroOrder
    .map((type) => heroes.find((o) => o.heroType === type))
    .filter(Boolean) as Opportunity[];

  const categories = ['All', ...Array.from(new Set(opportunities.map((o) => o.category))).sort()];

  const filtered = opportunities.filter((o) => {
    if (tierFilter !== 0 && o.tier !== tierFilter) return false;
    if (catFilter !== 'All' && o.category !== catFilter) return false;
    return true;
  });

  const tier1 = filtered.filter((o) => o.tier === 1);
  const tier2 = filtered.filter((o) => o.tier === 2);
  const tier3 = filtered.filter((o) => o.tier === 3);

  return (
    <div className="flex-1 p-6 overflow-y-auto" style={{ background: '#0a0a0a' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Edge Scanner</h1>
          <p className="text-sm text-gray-500">
            7-module scoring · Kalshi prediction markets · Where the crowd is wrong
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && <span className="text-[10px] text-gray-600">Updated {lastUpdated}</span>}
          <button
            onClick={load}
            disabled={loading}
            className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/8 border border-white/10 rounded-lg text-gray-400 disabled:opacity-50 transition-all"
          >
            {loading ? 'Scanning…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
          {error}
        </div>
      )}

      {loading && opportunities.length === 0 && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-44 rounded-xl border border-white/5 animate-pulse" style={{ background: '#111' }} />
          ))}
        </div>
      )}

      {/* Hero Cards */}
      {heroCards.length > 0 && (
        <div className="mb-6">
          <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-3">Best Opportunities Right Now</div>
          <div className="grid grid-cols-2 gap-3">
            {heroCards.map((opp) => <HeroCard key={opp.id} opp={opp} />)}
          </div>
        </div>
      )}

      {/* Filters */}
      {opportunities.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-0.5 bg-white/3 rounded-lg p-0.5">
            {([0, 1, 2, 3] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTierFilter(t)}
                className={`text-[11px] px-2.5 py-1 rounded-md transition-all ${
                  tierFilter === t ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {t === 0 ? 'All' : `Tier ${t}`}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-0.5 bg-white/3 rounded-lg p-0.5 flex-wrap">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCatFilter(cat)}
                className={`text-[11px] px-2.5 py-1 rounded-md transition-all ${
                  catFilter === cat ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <span className="text-[10px] text-gray-600 ml-auto">{filtered.length} markets</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && opportunities.length === 0 && !error && (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">🔍</div>
          <div className="text-gray-400 text-sm mb-1">No opportunities found</div>
          <div className="text-gray-600 text-xs mb-2">
            {meta && meta.kalshiFetched === 0
              ? 'Kalshi API unreachable from the server — check network policy'
              : meta
              ? `Fetched ${meta.kalshiFetched} Kalshi markets but none scored — markets may be fully priced`
              : 'Kalshi may be slow or all markets are fully priced'}
          </div>
          {meta && (
            <div className="text-[10px] text-gray-700 mb-4">
              Kalshi: {meta.kalshiFetched} · Polymarket: {meta.polymarketFetched} · Scored: {meta.scored}
            </div>
          )}
          <button onClick={load} className="text-xs px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
            Try Again
          </button>
        </div>
      )}

      {/* Tier 1 */}
      {tier1.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Tier 1 — Strong Edge</span>
            <span className="text-[10px] text-gray-600">Score 30+</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {tier1.map((opp, i) => <OpportunityCard key={opp.id} opp={opp} rank={i + 1} />)}
          </div>
        </div>
      )}

      {/* Tier 2 */}
      {tier2.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Tier 2 — Moderate Edge</span>
            <span className="text-[10px] text-gray-600">Score 15–29</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {tier2.map((opp, i) => <OpportunityCard key={opp.id} opp={opp} rank={tier1.length + i + 1} />)}
          </div>
        </div>
      )}

      {/* Tier 3 */}
      {tier3.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Tier 3 — Watch List</span>
            <span className="text-[10px] text-gray-600">Score 4–14</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {tier3.map((opp, i) => (
              <OpportunityCard key={opp.id} opp={opp} rank={tier1.length + tier2.length + i + 1} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 pt-4 border-t border-white/5">
        <p className="text-[10px] text-gray-700">
          7 scoring modules: Price Conflict · Forgotten Market · Information Gap · Glitch Detection · Overreaction · Event Arbitrage · Crowd Emotion. Not financial advice.
        </p>
      </div>
    </div>
  );
}

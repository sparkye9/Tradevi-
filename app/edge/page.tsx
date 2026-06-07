'use client';

import { useState, useMemo, useRef, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Opportunity = {
  id: string;
  market: string;
  contract: string;
  source: string;
  category: string;
  marketSays: number;
  fairValue: number;
  edgePct: number;
  direction: 'YES' | 'NO';
  tier: 1 | 2 | 3;
  edgeScore: number;
  daysLeft: number;
  volume: number;
  catalyst: string;
  whyCrowdIsWrong: string;
  suggestedEntry: string;
  suggestedExit: string;
  heroType?: 'MISPRICED' | 'UNWATCHED' | 'PRE_NEWS' | 'CROWD_WRONG' | null;
  moduleScores: {
    mispricing: number;
    liquidity: number;
    newsTiming: number;
    crowdBias: number;
    catalystProximity: number;
    spreadQuality: number;
    payoffAsymmetry: number;
  };
};

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK: Opportunity[] = [
  {
    id: '1', market: 'Will the Fed cut rates at the July 2026 FOMC meeting?', contract: 'Yes',
    source: 'Kalshi', category: 'Economics', marketSays: 18, fairValue: 38, edgePct: 20,
    direction: 'YES', tier: 1, edgeScore: 82, daysLeft: 41, volume: 84200,
    catalyst: 'Jobs data missed by 3sigma; inflation trending below 2.5% for 3rd straight month',
    whyCrowdIsWrong: "Market is anchored to the last hawkish statement. Bond futures already pricing 2 cuts by year-end -- equity market hasn't caught up.",
    suggestedEntry: 'Buy YES below 22c', suggestedExit: 'Target 40c or 72h before meeting',
    heroType: 'MISPRICED',
    moduleScores: { mispricing: 91, liquidity: 45, newsTiming: 62, crowdBias: 70, catalystProximity: 88, spreadQuality: 55, payoffAsymmetry: 74 },
  },
  {
    id: '2', market: 'Will Bitcoin close above $120,000 in June 2026?', contract: 'Yes',
    source: 'Polymarket', category: 'Crypto', marketSays: 72, fairValue: 55, edgePct: -17,
    direction: 'NO', tier: 1, edgeScore: 76, daysLeft: 23, volume: 312000,
    catalyst: 'ETF outflows accelerating; Coinbase premium turned negative; whale wallets distributing',
    whyCrowdIsWrong: 'Retail is chasing momentum from May breakout. On-chain data shows distribution not accumulation. Same pattern as Nov 2021 top.',
    suggestedEntry: 'Buy NO above 68c', suggestedExit: 'Target 45c or close 5d before month-end',
    heroType: 'CROWD_WRONG',
    moduleScores: { mispricing: 68, liquidity: 40, newsTiming: 55, crowdBias: 89, catalystProximity: 72, spreadQuality: 60, payoffAsymmetry: 80 },
  },
  {
    id: '3', market: 'Will the next US jobs report show unemployment above 4.5%?', contract: '4.5% to 5.0%',
    source: 'Kalshi', category: 'Economics', marketSays: 11, fairValue: 26, edgePct: 15,
    direction: 'YES', tier: 1, edgeScore: 71, daysLeft: 6, volume: 3400,
    catalyst: 'BLS releases Friday. Leading indicators (continuing claims +8%, temp staffing -12%) point higher.',
    whyCrowdIsWrong: "Low volume -- nobody is watching this contract. Continuing claims already signal deterioration that hasn't hit the headline number yet.",
    suggestedEntry: 'Buy YES below 14c', suggestedExit: 'Close position day before release',
    heroType: 'UNWATCHED',
    moduleScores: { mispricing: 72, liquidity: 94, newsTiming: 78, crowdBias: 55, catalystProximity: 91, spreadQuality: 48, payoffAsymmetry: 67 },
  },
  {
    id: '4', market: 'Will Ukraine-Russia ceasefire be announced before August 2026?', contract: 'Yes',
    source: 'Polymarket', category: 'Geopolitics', marketSays: 34, fairValue: 19, edgePct: -15,
    direction: 'NO', tier: 1, edgeScore: 68, daysLeft: 54, volume: 145000,
    catalyst: 'Back-channel talks collapsed last week; new offensive launched on eastern front',
    whyCrowdIsWrong: 'Ceasefire optimism spiked on a single Reuters headline that was retracted. Market moved 12pts and never retraced. Structural conditions unchanged.',
    suggestedEntry: 'Buy NO above 62c', suggestedExit: 'Target 78c or scale out in thirds',
    heroType: 'PRE_NEWS',
    moduleScores: { mispricing: 55, liquidity: 38, newsTiming: 92, crowdBias: 67, catalystProximity: 60, spreadQuality: 70, payoffAsymmetry: 62 },
  },
  {
    id: '5', market: 'Will the S&P 500 end Q3 2026 above 6,000?', contract: '6000 to 6500',
    source: 'PredictIt', category: 'Economics', marketSays: 58, fairValue: 44, edgePct: -14,
    direction: 'NO', tier: 2, edgeScore: 54, daysLeft: 86, volume: 27600,
    catalyst: 'Earnings season begins; forward guidance likely to disappoint on margin compression',
    whyCrowdIsWrong: "Consensus is anchored to YTD gains. Operating margins compressing for 3 straight quarters. Multiple expansion cannot continue at current rate levels.",
    suggestedEntry: 'Buy NO above 55c', suggestedExit: 'Target 38c by mid-Q3',
    heroType: null,
    moduleScores: { mispricing: 52, liquidity: 44, newsTiming: 40, crowdBias: 58, catalystProximity: 50, spreadQuality: 62, payoffAsymmetry: 55 },
  },
  {
    id: '6', market: 'Will Shohei Ohtani hit 50+ home runs in the 2026 MLB season?', contract: '50 or more',
    source: 'Kalshi', category: 'Sports', marketSays: 29, fairValue: 41, edgePct: 12,
    direction: 'YES', tier: 2, edgeScore: 50, daysLeft: 128, volume: 8900,
    catalyst: 'Currently on pace for 52 HR with no injury concerns; favorable schedule stretch ahead',
    whyCrowdIsWrong: 'Market underweights his current pace. Last 30 games: 1.4 HR/week. Crowd is anchoring to career averages rather than current season trajectory.',
    suggestedEntry: 'Buy YES below 32c', suggestedExit: 'Target 45c or after All-Star break',
    heroType: null,
    moduleScores: { mispricing: 45, liquidity: 55, newsTiming: 30, crowdBias: 48, catalystProximity: 55, spreadQuality: 42, payoffAsymmetry: 60 },
  },
  {
    id: '7', market: 'Will the Democratic Party win the 2026 Florida Senate seat?', contract: 'Yes',
    source: 'PredictIt', category: 'Politics', marketSays: 22, fairValue: 32, edgePct: 10,
    direction: 'YES', tier: 2, edgeScore: 46, daysLeft: 151, volume: 19400,
    catalyst: 'Republican incumbent approval at 38%; generic Democrat polling within margin',
    whyCrowdIsWrong: 'Incumbent fatigue + shifting demographics underweighted. DC crowd anchors to "Florida is red" narrative, ignoring county-level swing data.',
    suggestedEntry: 'Buy YES below 25c', suggestedExit: 'Target 35c after primary',
    heroType: null,
    moduleScores: { mispricing: 40, liquidity: 50, newsTiming: 35, crowdBias: 45, catalystProximity: 42, spreadQuality: 55, payoffAsymmetry: 48 },
  },
  {
    id: '8', market: 'Will Ethereum ETF net inflows exceed $500M in July 2026?', contract: 'Yes',
    source: 'Polymarket', category: 'Crypto', marketSays: 41, fairValue: 29, edgePct: -12,
    direction: 'NO', tier: 3, edgeScore: 35, daysLeft: 38, volume: 5200,
    catalyst: 'ETH ETF has shown consistent outflows last 6 weeks; institutional demand rotating to BTC',
    whyCrowdIsWrong: 'Crypto twitter hype about ETH 3.0 upgrade not translating to ETF inflows. Product still relatively unknown to TradFi buyers.',
    suggestedEntry: 'Buy NO above 56c', suggestedExit: 'Target 68c or end of month',
    heroType: null,
    moduleScores: { mispricing: 30, liquidity: 38, newsTiming: 28, crowdBias: 40, catalystProximity: 35, spreadQuality: 30, payoffAsymmetry: 38 },
  },
  {
    id: '9', market: 'Will there be a US-China trade deal signed before December 2026?', contract: 'Yes',
    source: 'Kalshi', category: 'Geopolitics', marketSays: 15, fairValue: 24, edgePct: 9,
    direction: 'YES', tier: 3, edgeScore: 30, daysLeft: 177, volume: 11300,
    catalyst: 'APEC summit in November; both sides signaling willingness to reduce tariffs on select goods',
    whyCrowdIsWrong: 'Media narrative is all doom and gloom on trade war, but behind-the-scenes diplomatic progress is underweighted.',
    suggestedEntry: 'Buy YES below 18c', suggestedExit: 'Target 28c after APEC',
    heroType: null,
    moduleScores: { mispricing: 28, liquidity: 32, newsTiming: 25, crowdBias: 30, catalystProximity: 38, spreadQuality: 28, payoffAsymmetry: 32 },
  },
  {
    id: '10', market: 'Will NBA Finals 2026 go to Game 7?', contract: 'Yes',
    source: 'PredictIt', category: 'Sports', marketSays: 33, fairValue: 42, edgePct: 9,
    direction: 'YES', tier: 3, edgeScore: 28, daysLeft: 12, volume: 6700,
    catalyst: 'Series tied 3-3; both teams healthy; home-court advantage neutralized',
    whyCrowdIsWrong: 'Historical base rate for Game 7 from 3-3: 100%. Market is somehow pricing it lower than base rate.',
    suggestedEntry: 'Buy YES below 36c', suggestedExit: 'Sell immediately once Game 7 confirmed',
    heroType: null,
    moduleScores: { mispricing: 22, liquidity: 30, newsTiming: 20, crowdBias: 25, catalystProximity: 40, spreadQuality: 35, payoffAsymmetry: 45 },
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: unknown, suffix = '') =>
  n == null || isNaN(Number(n)) ? '--' : `${Number(n).toFixed(0)}${suffix}`;

const fmtVol = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` :
  v >= 1_000 ? `${(v / 1_000).toFixed(1)}k` : String(v);

const SOURCE_COLORS: Record<string, string> = {
  Kalshi: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  Polymarket: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  PredictIt: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
};

const CAT_COLORS: Record<string, string> = {
  Politics: 'text-blue-400',
  Economics: 'text-emerald-400',
  Crypto: 'text-yellow-400',
  Sports: 'text-pink-400',
  Geopolitics: 'text-red-400',
  Other: 'text-gray-400',
};

const HERO_META = {
  MISPRICED:   { emoji: '🎯', label: 'Mispriced Probability', key: 'mispricing' as const },
  UNWATCHED:   { emoji: '👀', label: "Nobody's Watching",     key: 'liquidity'   as const },
  PRE_NEWS:    { emoji: '⚡', label: 'Breaking Before News',  key: 'newsTiming'  as const },
  CROWD_WRONG: { emoji: '🔥', label: 'Crowd Is Wrong',        key: 'crowdBias'   as const },
} as const;

const MODULE_LABELS: Record<keyof Opportunity['moduleScores'], string> = {
  mispricing:         'Mispricing',
  liquidity:          'Low Liquidity',
  newsTiming:         'News Timing',
  crowdBias:          'Crowd Bias',
  catalystProximity:  'Catalyst Prox',
  spreadQuality:      'Spread Quality',
  payoffAsymmetry:    'Payoff Asymm.',
};

function pickHero(opps: Opportunity[], key: keyof Opportunity['moduleScores']): Opportunity | null {
  return opps.reduce<Opportunity | null>((best, o) =>
    o.moduleScores[key] > (best?.moduleScores[key] ?? -1) ? o : best, null);
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ModuleBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const color = v >= 70 ? 'bg-emerald-500' : v >= 40 ? 'bg-amber-500' : 'bg-gray-600';
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-500 w-24 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${v}%` }} />
      </div>
      <span className="text-[10px] font-mono text-gray-400 w-6 text-right">{v}</span>
    </div>
  );
}

// ─── Hero Card ────────────────────────────────────────────────────────────────

function HeroCard({ type, opp }: { type: keyof typeof HERO_META; opp: Opportunity | null }) {
  const { emoji, label } = HERO_META[type];
  const borderColor =
    type === 'MISPRICED'   ? 'border-emerald-500/40' :
    type === 'UNWATCHED'   ? 'border-blue-500/40' :
    type === 'PRE_NEWS'    ? 'border-yellow-500/40' : 'border-red-500/40';
  const textColor =
    type === 'MISPRICED'   ? 'text-emerald-400' :
    type === 'UNWATCHED'   ? 'text-blue-400' :
    type === 'PRE_NEWS'    ? 'text-yellow-400' : 'text-red-400';

  if (!opp) {
    return (
      <div className={`snap-start shrink-0 w-72 md:w-auto rounded-2xl border ${borderColor} p-4 flex flex-col gap-2 opacity-40`}
        style={{ background: '#111' }}>
        <div className="text-xl">{emoji}</div>
        <div className={`text-xs font-bold ${textColor}`}>{label}</div>
        <div className="text-xs text-gray-600 mt-auto">No {label.toLowerCase()} edge right now</div>
      </div>
    );
  }

  const yesDir = opp.direction === 'YES';

  return (
    <div className={`snap-start shrink-0 w-72 md:w-auto rounded-2xl border ${borderColor} p-4 flex flex-col gap-3`}
      style={{ background: '#111' }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xl">{emoji}</div>
          <div className={`text-xs font-bold ${textColor} mt-0.5`}>{label}</div>
        </div>
        <div className={`px-2.5 py-1 rounded-full text-xs font-bold ${yesDir ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
          Bet {opp.direction}
        </div>
      </div>

      <p className="text-sm text-white font-medium leading-snug line-clamp-2">{opp.market}</p>
      {opp.contract && <p className="text-[10px] text-gray-500">Contract: {opp.contract}</p>}

      <div className="grid grid-cols-3 gap-1.5">
        {[
          { label: 'Market Says', val: `${fmt(opp.marketSays)}%` },
          { label: 'Fair Value',  val: `${fmt(opp.fairValue)}%` },
          { label: 'Edge Score',  val: fmt(opp.edgeScore) },
        ].map(({ label: l, val }) => (
          <div key={l} className="bg-white/3 rounded-lg p-1.5 text-center">
            <div className="text-[9px] text-gray-600 leading-none mb-0.5">{l}</div>
            <div className={`text-sm font-bold font-mono ${l === 'Fair Value' ? textColor : 'text-white'}`}>{val}</div>
          </div>
        ))}
      </div>

      {opp.catalyst && (
        <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-2">{opp.catalyst}</p>
      )}
    </div>
  );
}

// ─── Expandable detail ────────────────────────────────────────────────────────

function ExpandedDetail({ opp }: { opp: Opportunity }) {
  const blocks = [
    { label: 'Catalyst',          val: opp.catalyst },
    { label: 'Why Crowd Is Wrong',val: opp.whyCrowdIsWrong },
    { label: 'Suggested Entry',   val: opp.suggestedEntry },
    { label: 'Suggested Exit',    val: opp.suggestedExit },
  ];
  return (
    <div className="px-4 pb-4 pt-3 border-t border-white/5 flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {blocks.map(({ label, val }) => (
          <div key={label} className="bg-white/3 rounded-xl p-3">
            <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">{label}</div>
            <div className="text-xs text-gray-300 leading-relaxed">{val || '--'}</div>
          </div>
        ))}
      </div>
      <div className="bg-white/3 rounded-xl p-3">
        <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-2">Score Breakdown</div>
        <div className="flex flex-col gap-1.5">
          {(Object.entries(MODULE_LABELS) as [keyof Opportunity['moduleScores'], string][]).map(([key, lbl]) => (
            <ModuleBar key={key} label={lbl} value={opp.moduleScores?.[key] ?? 0} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Opportunity row ──────────────────────────────────────────────────────────

function OpportunityRow({
  opp, expanded, onToggle,
}: { opp: Opportunity; expanded: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    if (expanded) {
      setHeight(ref.current.scrollHeight);
    } else {
      setHeight(0);
    }
  }, [expanded]);

  const up = opp.fairValue > opp.marketSays;
  const srcColor = SOURCE_COLORS[opp.source] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/30';
  const edgeSigned = opp.edgePct != null
    ? `${opp.edgePct > 0 ? '+' : ''}${opp.edgePct.toFixed(1)}%`
    : '--';

  return (
    <div className="rounded-xl border border-white/5 overflow-hidden" style={{ background: '#111' }}>
      <button
        className="w-full text-left px-4 py-3 flex items-center gap-2 hover:bg-white/3 transition-colors"
        onClick={onToggle}
      >
        {/* Source badge */}
        <span className={`hidden sm:inline text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${srcColor}`}>
          {opp.source}
        </span>

        {/* Market + contract */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-200 font-medium truncate">{opp.market}</div>
          {opp.contract && (
            <div className="text-[10px] text-gray-600 truncate">{opp.contract}</div>
          )}
        </div>

        {/* Price arrow */}
        <div className="flex items-center gap-1 shrink-0 text-xs font-mono">
          <span className="text-gray-400">{fmt(opp.marketSays)}%</span>
          <span className={up ? 'text-emerald-400' : 'text-red-400'}>{up ? '↑' : '↓'}</span>
          <span className={up ? 'text-emerald-400' : 'text-red-400'}>{fmt(opp.fairValue)}%</span>
        </div>

        {/* Edge badge */}
        <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded shrink-0 ${
          up ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
        }`}>
          {edgeSigned}
        </span>

        {/* Direction chip */}
        <span className={`hidden sm:inline text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
          opp.direction === 'YES' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
        }`}>
          {opp.direction}
        </span>

        {/* Days + volume */}
        <div className="hidden md:flex items-center gap-2 text-[10px] text-gray-600 font-mono shrink-0">
          <span>{fmt(opp.daysLeft)}d</span>
          <span>{opp.volume ? fmtVol(opp.volume) : '--'}</span>
        </div>

        <span className="text-[10px] text-gray-600 shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Animated expand */}
      <div
        ref={ref}
        style={{ maxHeight: height, overflow: 'hidden', transition: 'max-height 0.25s ease' }}
      >
        {expanded && <ExpandedDetail opp={opp} />}
      </div>
    </div>
  );
}

// ─── Tier section ─────────────────────────────────────────────────────────────

function TierSection({
  tier, opps, expandedId, onToggle, isMobile,
}: {
  tier: 1 | 2 | 3;
  opps: Opportunity[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  isMobile: boolean;
}) {
  const [localExpanded, setLocalExpanded] = useState<Set<string>>(new Set());

  const labels = { 1: 'Tier 1 -- High Conviction', 2: 'Tier 2 -- Moderate', 3: 'Tier 3 -- Speculative' };
  const colors = { 1: 'text-emerald-400', 2: 'text-amber-400', 3: 'text-gray-500' };

  if (opps.length === 0) return null;

  const toggle = (id: string) => {
    if (isMobile) {
      onToggle(id); // accordion: parent manages
    } else {
      setLocalExpanded(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    }
  };

  const isExpanded = (id: string) => isMobile ? expandedId === id : localExpanded.has(id);

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[10px] font-bold uppercase tracking-widest ${colors[tier]}`}>{labels[tier]}</span>
        <span className="text-[10px] text-gray-700">{opps.length} markets</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {opps.map(opp => (
          <OpportunityRow
            key={opp.id}
            opp={opp}
            expanded={isExpanded(opp.id)}
            onToggle={() => toggle(opp.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

const ALL_CATEGORIES = ['Politics', 'Economics', 'Crypto', 'Sports', 'Geopolitics', 'Other'];

function FilterBar({
  tierFilter, setTierFilter, catFilter, setCatFilter, activeCount,
}: {
  tierFilter: 0 | 1 | 2 | 3;
  setTierFilter: (t: 0 | 1 | 2 | 3) => void;
  catFilter: Set<string>;
  setCatFilter: (f: Set<string>) => void;
  activeCount: number;
}) {
  const toggleCat = (cat: string) => {
    const next = new Set(catFilter);
    if (cat === 'All') { setCatFilter(new Set()); return; }
    next.has(cat) ? next.delete(cat) : next.add(cat);
    setCatFilter(next);
  };

  const hasActive = tierFilter !== 0 || catFilter.size > 0;

  return (
    <div className="sticky top-0 z-20 py-2 -mx-3 px-3 md:-mx-6 md:px-6" style={{ background: '#0a0a0a' }}>
      <div className="flex flex-wrap items-center gap-2">
        {/* Tier filter */}
        <div className="flex items-center gap-0.5 bg-white/3 rounded-lg p-0.5">
          {([0, 1, 2, 3] as const).map(t => (
            <button key={t} onClick={() => setTierFilter(t)}
              className={`text-[11px] px-2.5 py-1 rounded-md transition-all ${
                tierFilter === t ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}>
              {t === 0 ? 'All' : `T${t}`}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap items-center gap-0.5 bg-white/3 rounded-lg p-0.5">
          <button onClick={() => toggleCat('All')}
            className={`text-[11px] px-2 py-1 rounded-md transition-all ${
              catFilter.size === 0 ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}>All</button>
          {ALL_CATEGORIES.map(cat => (
            <button key={cat} onClick={() => toggleCat(cat)}
              className={`text-[11px] px-2 py-1 rounded-md transition-all ${
                catFilter.has(cat) ? `bg-white/10 ${CAT_COLORS[cat] ?? 'text-white'}` : 'text-gray-500 hover:text-gray-300'
              }`}>{cat}</button>
          ))}
        </div>

        {/* Active count + clear */}
        <div className="ml-auto flex items-center gap-2">
          {hasActive && (
            <>
              <span className="text-[10px] text-gray-600">{activeCount} shown</span>
              <button onClick={() => { setTierFilter(0); setCatFilter(new Set()); }}
                className="text-[10px] text-gray-500 hover:text-gray-300 underline underline-offset-2">
                Clear
              </button>
            </>
          )}
          {!hasActive && <span className="text-[10px] text-gray-700">{activeCount} markets</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EdgePage() {
  const [tierFilter, setTierFilter] = useState<0 | 1 | 2 | 3>(0);
  const [catFilter, setCatFilter] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggleExpand = (id: string) =>
    setExpandedId(prev => (prev === id ? null : id));

  // Hero picks
  const heroes = useMemo(() => ({
    MISPRICED:   pickHero(MOCK, 'mispricing'),
    UNWATCHED:   pickHero(MOCK, 'liquidity'),
    PRE_NEWS:    pickHero(MOCK, 'newsTiming'),
    CROWD_WRONG: pickHero(MOCK, 'crowdBias'),
  }), []);

  // Filtered + sorted list
  const filtered = useMemo(() => {
    return [...MOCK]
      .filter(o => tierFilter === 0 || o.tier === tierFilter)
      .filter(o => catFilter.size === 0 || catFilter.has(o.category))
      .sort((a, b) => Math.abs(b.edgePct) - Math.abs(a.edgePct));
  }, [tierFilter, catFilter]);

  const byTier = useMemo(() => ({
    1: filtered.filter(o => o.tier === 1),
    2: filtered.filter(o => o.tier === 2),
    3: filtered.filter(o => o.tier === 3),
  }), [filtered]);

  const isEmpty = MOCK.length === 0;

  return (
    <div className="flex-1 p-3 md:p-6 overflow-y-auto" style={{ background: '#0a0a0a' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white">Edge Scanner</h1>
          <p className="text-xs text-gray-600 mt-0.5">Prediction markets · Where the crowd is wrong</p>
        </div>
        <span className="text-[10px] text-gray-700 font-mono">{MOCK.length} markets loaded</span>
      </div>

      {/* ── Section 1: Hero Cards ── */}
      <div className="mb-6">
        <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-3">Best Opportunities Right Now</div>
        {/* Mobile: horizontal snap carousel */}
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth md:hidden">
          {(Object.keys(HERO_META) as (keyof typeof HERO_META)[]).map(type => (
            <HeroCard key={type} type={type} opp={heroes[type]} />
          ))}
        </div>
        {/* Desktop: 2x2 grid */}
        <div className="hidden md:grid grid-cols-2 gap-3">
          {(Object.keys(HERO_META) as (keyof typeof HERO_META)[]).map(type => (
            <HeroCard key={type} type={type} opp={heroes[type]} />
          ))}
        </div>
      </div>

      {/* ── Section 4: Filter bar (sticky, above tier list) ── */}
      <FilterBar
        tierFilter={tierFilter}
        setTierFilter={setTierFilter}
        catFilter={catFilter}
        setCatFilter={setCatFilter}
        activeCount={filtered.length}
      />

      {/* ── Sections 2+3: Tier list with expandable rows ── */}
      {isEmpty ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🔍</div>
          <div className="text-gray-400 text-sm mb-1">No opportunities -- check data feed</div>
          <div className="text-gray-600 text-xs">Active sources: 0</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-500 text-sm">No markets match current filters</div>
          <button onClick={() => { setTierFilter(0); setCatFilter(new Set()); }}
            className="mt-3 text-xs text-emerald-400 underline underline-offset-2">Clear filters</button>
        </div>
      ) : (
        <div className="mt-4">
          {([1, 2, 3] as const).map(t => (
            <TierSection
              key={t}
              tier={t}
              opps={byTier[t]}
              expandedId={expandedId}
              onToggle={toggleExpand}
              isMobile={isMobile}
            />
          ))}
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-white/5">
        <p className="text-[10px] text-gray-700">
          Edge Scanner · 7-module scoring model · Not financial advice · Data: Kalshi, Polymarket, PredictIt, Manifold
        </p>
      </div>
    </div>
  );
}

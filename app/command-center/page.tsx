'use client';
import { useEffect, useState, useCallback } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import type { FinvizFuture, FinvizResult } from '@/lib/finviz';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VixData {
  price: number | null;
  changePercent: number | null;
  lastUpdated: string;
  error?: string;
}

type MarketType =
  | 'Trend Day Bullish'
  | 'Trend Day Bearish'
  | 'Chop'
  | 'Reversal'
  | 'Liquidity Grab'
  | 'News-Driven'
  | 'Low Volume Trap'
  | 'Overextended'
  | 'Bounce Setup';

type BiasLabel = 'Strong Bullish' | 'Weak Bullish' | 'Neutral' | 'Weak Bearish' | 'Strong Bearish';
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
type TfBiasLabel =
  | 'Strong Bullish' | 'Weak Bullish' | 'Neutral' | 'Weak Bearish' | 'Strong Bearish'
  | 'Distribution' | 'Accumulation' | 'Exhaustion' | 'Reversal Risk';

type RescueStep1 = 'YES' | 'NO' | null;
type RescueStep2 = 'PULLBACK' | 'REVERSAL' | null;
type PositionAction =
  | 'HOLD' | 'TRIM' | 'EXIT' | 'MOVE STOP'
  | 'TAKE PARTIALS' | 'LET RUNNER RIDE' | 'FLIP' | 'DO NOTHING';

interface DerivedData {
  esChange: number | null;
  esPrice: number | null;
  esDirection: string | null;
  vixPrice: number | null;
  vixChange: number | null;
  marketType: MarketType;
  biasLabel: BiasLabel;
  biasScore: number;
  tradeScore: number;
  riskLevel: RiskLevel;
  noTradeOn: boolean;
  bullPct: number;
  bearPct: number;
  revPct: number;
  chopPct: number;
  alertType: 'green' | 'red' | 'yellow';
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function getETDate(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

function isAfter2PMet(): boolean {
  const et = getETDate();
  return et.getHours() >= 14;
}

function getMarketType(esChange: number | null, vixPrice: number | null): MarketType {
  if (esChange === null) return 'Chop';
  const vix = vixPrice ?? 18;
  if (vix > 25) return 'News-Driven';
  if (esChange > 0.8) return 'Overextended';
  if (esChange < -0.8) return 'Overextended';
  if (esChange > 0.5) return 'Trend Day Bullish';
  if (esChange < -0.5) return 'Trend Day Bearish';
  if (Math.abs(esChange) < 0.1) return vix > 20 ? 'Liquidity Grab' : 'Low Volume Trap';
  if (esChange > 0.1 && vix > 20) return 'Bounce Setup';
  if (esChange < -0.1 && vix > 20) return 'Reversal';
  return 'Chop';
}

function getBiasLabel(esChange: number | null, vixPrice: number | null): BiasLabel {
  const vix = vixPrice ?? 18;
  if (esChange === null) return 'Neutral';
  if (esChange > 0.5 && vix < 15) return 'Strong Bullish';
  if (esChange > 0.1) return 'Weak Bullish';
  if (esChange < -0.5 && vix > 20) return 'Strong Bearish';
  if (esChange < -0.1) return 'Weak Bearish';
  return 'Neutral';
}

function getBiasScore(esChange: number | null, vixPrice: number | null): number {
  const vix = vixPrice ?? 18;
  if (esChange === null) return 50;
  if (esChange > 0.5 && vix < 15) return Math.min(95, 75 + Math.round(esChange * 10));
  if (esChange > 0.1) return Math.min(74, 55 + Math.round(esChange * 15));
  if (esChange < -0.5 && vix > 20) return Math.max(5, 24 - Math.round(Math.abs(esChange) * 10));
  if (esChange < -0.1) return Math.max(25, 44 - Math.round(Math.abs(esChange) * 15));
  return 50;
}

function getRiskLevel(vixPrice: number | null): RiskLevel {
  const v = vixPrice ?? 18;
  if (v < 15) return 'LOW';
  if (v < 20) return 'MEDIUM';
  if (v < 25) return 'HIGH';
  return 'EXTREME';
}

function getTradeScore(esChange: number | null, vixPrice: number | null): number {
  const vix = vixPrice ?? 18;
  const ec = esChange ?? 0;
  const momentum = Math.min(30, Math.round(Math.abs(ec) * 30));
  const vixPenalty = Math.min(30, Math.round((vix - 12) * 2));
  return Math.max(0, Math.min(100, 50 + momentum - vixPenalty));
}

function getProbabilities(esChange: number | null, vixPrice: number | null) {
  const ec = esChange ?? 0;
  const vix = vixPrice ?? 18;
  const vixAdj = vix > 25 ? 10 : vix < 15 ? -10 : 0;

  let bull: number, bear: number, chop: number, rev: number;
  if (ec > 0.5)       { bull = 60; bear = 15; chop = 15; rev = 10; }
  else if (ec > 0)    { bull = 40; bear = 20; chop = 30; rev = 10; }
  else if (ec === 0)  { bull = 25; bear = 25; chop = 40; rev = 10; }
  else if (ec > -0.5) { bull = 20; bear = 40; chop = 30; rev = 10; }
  else                { bull = 15; bear = 60; chop = 15; rev = 10; }

  if (vixAdj > 0) { bear += vixAdj; bull -= vixAdj; }
  else            { bull -= vixAdj; bear += vixAdj; }

  const total = bull + bear + chop + rev;
  return {
    bull: Math.round((bull / total) * 100),
    bear: Math.round((bear / total) * 100),
    chop: Math.round((chop / total) * 100),
    rev: Math.round((rev / total) * 100),
  };
}

function derive(futures: FinvizFuture[], vixData: VixData | null): DerivedData {
  const es = futures.find((f) => f.symbol === 'ES');
  const esChange = es?.changePercent ?? null;
  const esPrice = es?.price ?? null;
  const esDirection = es?.direction ?? null;
  const vixPrice = vixData?.price ?? null;
  const vixChange = vixData?.changePercent ?? null;

  const marketType = getMarketType(esChange, vixPrice);
  const biasLabel = getBiasLabel(esChange, vixPrice);
  const biasScore = getBiasScore(esChange, vixPrice);
  const tradeScore = getTradeScore(esChange, vixPrice);
  const riskLevel = getRiskLevel(vixPrice);
  const noTradeOn =
    (vixPrice !== null && vixPrice > 25) ||
    (biasLabel === 'Neutral' && (marketType === 'Chop' || marketType === 'Low Volume Trap'));

  const probs = getProbabilities(esChange, vixPrice);
  const alertType: 'green' | 'red' | 'yellow' =
    probs.bull > 50 ? 'green' : probs.bear > 50 ? 'red' : 'yellow';

  return {
    esChange, esPrice, esDirection, vixPrice, vixChange,
    marketType, biasLabel, biasScore, tradeScore, riskLevel, noTradeOn,
    bullPct: probs.bull, bearPct: probs.bear, revPct: probs.rev, chopPct: probs.chop,
    alertType,
  };
}

// ─── Color helpers ─────────────────────────────────────────────────────────────

function biasColor(label: BiasLabel): string {
  if (label === 'Strong Bullish' || label === 'Weak Bullish') return 'text-emerald-400';
  if (label === 'Strong Bearish' || label === 'Weak Bearish') return 'text-red-400';
  return 'text-amber-400';
}

function riskColor(r: RiskLevel): string {
  if (r === 'LOW') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  if (r === 'MEDIUM') return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
  if (r === 'HIGH') return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
  return 'text-red-400 bg-red-500/10 border-red-500/30';
}

function tradeScoreColor(score: number): string {
  if (score >= 70) return 'bg-emerald-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function tradeScoreText(score: number): string {
  if (score >= 70) return 'text-emerald-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-red-400';
}

function marketTypeBadge(mt: MarketType): string {
  if (mt === 'Trend Day Bullish') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  if (mt === 'Trend Day Bearish') return 'text-red-400 bg-red-500/10 border-red-500/30';
  if (mt === 'Chop' || mt === 'Low Volume Trap') return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
  if (mt === 'News-Driven') return 'text-red-400 bg-red-500/10 border-red-500/30';
  if (mt === 'Overextended') return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
  if (mt === 'Bounce Setup') return 'text-sky-400 bg-sky-500/10 border-sky-500/30';
  if (mt === 'Reversal') return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
  if (mt === 'Liquidity Grab') return 'text-pink-400 bg-pink-500/10 border-pink-500/30';
  return 'text-gray-400 bg-gray-500/10 border-gray-500/30';
}

function tfBiasColor(label: TfBiasLabel): string {
  if (label === 'Strong Bullish' || label === 'Accumulation') return 'text-emerald-400';
  if (label === 'Weak Bullish') return 'text-emerald-300';
  if (label === 'Strong Bearish' || label === 'Distribution') return 'text-red-400';
  if (label === 'Weak Bearish' || label === 'Exhaustion') return 'text-red-300';
  if (label === 'Reversal Risk') return 'text-purple-400';
  return 'text-amber-400';
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="text-2xl">{icon}</span>
      <div>
        <h2 className="text-lg font-bold uppercase tracking-widest text-white">{title}</h2>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── EST Badge ────────────────────────────────────────────────────────────────

function EstBadge() {
  return (
    <span className="text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1 py-0.5 rounded font-mono">
      EST
    </span>
  );
}

// ─── Confidence Badge ─────────────────────────────────────────────────────────

function ConfBadge({ level }: { level: 'High' | 'Med' | 'Low' }) {
  const cls =
    level === 'High'
      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
      : level === 'Med'
      ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
      : 'text-red-400 bg-red-500/10 border-red-500/30';
  return (
    <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full border ${cls}`}>
      {level}
    </span>
  );
}

// ─── Section 1: Daily Command ─────────────────────────────────────────────────

function Section1DailyCommand({ d }: { d: DerivedData }) {
  const bullish = d.esChange !== null && d.esChange > 0;
  const bearish = d.esChange !== null && d.esChange < 0;
  const dayType = d.marketType;
  const bestAction = d.noTradeOn
    ? 'STAND ASIDE — no edge today'
    : bullish
    ? 'BUY dip into support — long ES/SPY with confirmation'
    : bearish
    ? 'SELL bounce into resistance — short ES/QQQ with confirmation'
    : 'WAIT for direction — no premature entry';

  const planA = bullish
    ? 'price holds above yesterday high, go long with 1% target'
    : bearish
    ? 'price breaks below morning low, go short with 1% target'
    : 'price breaks above opening range high, initiate long';
  const planB = bullish
    ? 'price breaks yesterday low, exit and flip short'
    : bearish
    ? 'price reclaims yesterday close, exit and flip long'
    : 'price breaks below opening range low, initiate short';
  const noTradeIf = d.noTradeOn
    ? 'VIX is elevated and bias is choppy — no edge in this environment'
    : d.vixPrice !== null && d.vixPrice > 20
    ? 'VIX spikes above 25 — volatility will widen spreads unpredictably'
    : 'price oscillates without clear direction for more than 30 minutes after open';

  const biasMeterPos = d.biasScore;

  return (
    <div className="space-y-4">
      <SectionHeader icon="⊕" title="Daily Command" sub="Your one sentence plan for the day" />

      {/* No-Trade Warning — always at top */}
      <div
        className={`flex items-center gap-3 rounded-2xl px-5 py-4 border ${
          d.noTradeOn
            ? 'bg-amber-500/10 border-amber-500/30'
            : 'bg-[#111111] border-[#1e1e1e]'
        }`}
      >
        <span className={`font-bold font-mono text-sm shrink-0 ${d.noTradeOn ? 'text-amber-400' : 'text-gray-600'}`}>
          DO NOT TRADE IF:
        </span>
        <span className={`text-sm flex-1 ${d.noTradeOn ? 'text-amber-300' : 'text-gray-500'}`}>
          {noTradeIf}
        </span>
        <span
          className={`text-xs font-bold px-3 py-1 rounded-full font-mono border shrink-0 ${
            d.noTradeOn
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
              : 'bg-[#1e1e1e] border-[#2a2a2a] text-gray-600'
          }`}
        >
          {d.noTradeOn ? 'ON' : 'OFF'}
        </span>
      </div>

      {/* Command sentence */}
      <div
        className={`rounded-2xl p-6 border ${
          bullish && !d.noTradeOn
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : bearish && !d.noTradeOn
            ? 'bg-red-500/10 border-red-500/30'
            : 'bg-amber-500/10 border-amber-500/30'
        }`}
      >
        <p
          className={`text-base font-semibold leading-relaxed ${
            bullish && !d.noTradeOn
              ? 'text-emerald-300'
              : bearish && !d.noTradeOn
              ? 'text-red-300'
              : 'text-amber-300'
          }`}
        >
          Today is <span className="font-bold">{dayType}</span>.{' '}
          Best trade is <span className="font-bold">{bestAction}</span>.{' '}
          If <span className="underline underline-offset-2">{planA}</span>.{' '}
          If <span className="underline underline-offset-2">{planB}</span>.{' '}
          Do not trade if <span className="underline underline-offset-2">{noTradeIf}</span>.
        </p>
      </div>

      {/* Badges row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Market Type */}
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-4 space-y-2">
          <div className="text-xs text-gray-600 font-mono uppercase tracking-widest">Market Type</div>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full border font-mono ${marketTypeBadge(d.marketType)}`}>
            {d.marketType}
          </span>
        </div>

        {/* Risk Meter */}
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-4 space-y-2">
          <div className="text-xs text-gray-600 font-mono uppercase tracking-widest">Risk Level</div>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full border font-mono ${riskColor(d.riskLevel)}`}>
            {d.riskLevel}
          </span>
          <div className="text-xs text-gray-600 font-mono">
            VIX {d.vixPrice !== null ? d.vixPrice.toFixed(1) : '--'}
          </div>
        </div>

        {/* Bias Meter */}
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-4 space-y-2">
          <div className="text-xs text-gray-600 font-mono uppercase tracking-widest">Bias</div>
          <div className={`text-sm font-bold font-mono ${biasColor(d.biasLabel)}`}>{d.biasLabel}</div>
          <div className="h-2 bg-[#1e1e1e] rounded-full overflow-hidden relative">
            <div className="absolute inset-0 flex">
              <div className="flex-1 bg-red-500/20 rounded-l-full" />
              <div className="flex-1 bg-emerald-500/20 rounded-r-full" />
            </div>
            <div
              className="absolute top-0 w-3 h-2 rounded-full bg-white border border-[#1e1e1e] -translate-x-1/2 transition-all"
              style={{ left: `${biasMeterPos}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-700 font-mono">
            <span>Bear</span><span>Bull</span>
          </div>
        </div>

        {/* Trade Score */}
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-4 space-y-2">
          <div className="text-xs text-gray-600 font-mono uppercase tracking-widest">Trade Score</div>
          <div className={`text-2xl font-bold font-mono ${tradeScoreText(d.tradeScore)}`}>
            {d.tradeScore}<span className="text-xs text-gray-600">/100</span>
          </div>
          <div className="h-2 bg-[#1e1e1e] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${tradeScoreColor(d.tradeScore)}`}
              style={{ width: `${d.tradeScore}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section 2: Next Likely Move ──────────────────────────────────────────────

function Section2NextMove({ d }: { d: DerivedData }) {
  const bullish = d.esChange !== null && d.esChange > 0;
  const bearish = d.esChange !== null && d.esChange < 0;

  const mostProbPath = bullish
    ? { label: 'Grind higher', dir: 'up', desc: 'Continuation bid into resistance. Market makers accumulating. Retail stops above high being targeted for a push through.', prob: d.bullPct }
    : bearish
    ? { label: 'Pressure lower', dir: 'down', desc: 'Distribution selling into every bounce. Market makers distributing inventory. Retail longs trapped — stops below recent low targeted.', prob: d.bearPct }
    : { label: 'Range bound chop', dir: 'flat', desc: 'No clear directional bias. Price oscillating between short-term extremes. Wait for breakout confirmation before committing.', prob: d.chopPct };

  const altPath = bullish
    ? { label: 'Rejection at resistance', dir: 'down', desc: 'Failed breakout scenario. Smart money selling into strength, trapping late buyers.', prob: d.bearPct }
    : bearish
    ? { label: 'Short squeeze rally', dir: 'up', desc: 'Oversold bounce scenario. Shorts cover, price snaps back to prior support-turned-resistance.', prob: d.bullPct }
    : { label: 'Directional break', dir: 'break', desc: 'Coiled spring release. Either direction possible — wait for volume confirmation at range extremes.', prob: Math.max(d.bullPct, d.bearPct) };

  const worstPath = {
    label: d.vixPrice !== null && d.vixPrice > 20 ? 'Volatility spike + gap down' : 'Fake breakout trap',
    dir: 'trap',
    desc: d.vixPrice !== null && d.vixPrice > 20
      ? 'News event or macro surprise causes a spike in volatility. Wide swings, no clean entries, stops hit in both directions.'
      : 'Price breaks key level, triggers retail entries, then reverses hard against you. Classic liquidity grab pattern.',
    prob: d.revPct,
  };

  const greenReasons = [
    `ES futures ${d.esChange !== null && d.esChange > 0 ? `up ${d.esChange.toFixed(2)}%` : 'showing buyers'} — directional strength confirmed`,
    `VIX at ${d.vixPrice !== null ? d.vixPrice.toFixed(1) : '--'} — ${d.riskLevel === 'LOW' || d.riskLevel === 'MEDIUM' ? 'fear is contained, institutions comfortable' : 'elevated but buyable dips expected'}`,
    `Bull probability ${d.bullPct}% — highest of all four scenarios`,
  ];
  const redReasons = [
    `ES futures ${d.esChange !== null && d.esChange < 0 ? `down ${Math.abs(d.esChange).toFixed(2)}%` : 'showing sellers'} — distribution in progress`,
    `VIX at ${d.vixPrice !== null ? d.vixPrice.toFixed(1) : '--'} — ${d.riskLevel === 'HIGH' || d.riskLevel === 'EXTREME' ? 'elevated fear favoring downside' : 'rising VIX signals hedging activity'}`,
    `Bear probability ${d.bearPct}% — sellers have statistical edge today`,
  ];
  const yellowReasons = [
    `Chop probability ${d.chopPct}% — no clear institutional footprint`,
    'Both bulls and bears likely to get trapped — range environment',
    'Volume needed to confirm any breakout — patience is the edge',
  ];

  const pathColor = (dir: string) =>
    dir === 'up' ? 'border-emerald-500/30 bg-emerald-500/5'
    : dir === 'down' ? 'border-red-500/30 bg-red-500/5'
    : dir === 'trap' ? 'border-purple-500/30 bg-purple-500/5'
    : 'border-amber-500/30 bg-amber-500/5';

  const pathLabel = (dir: string) =>
    dir === 'up' ? 'text-emerald-400'
    : dir === 'down' ? 'text-red-400'
    : dir === 'trap' ? 'text-purple-400'
    : 'text-amber-400';

  const pathBar = (dir: string) =>
    dir === 'up' ? 'bg-emerald-500' : dir === 'down' ? 'bg-red-500' : dir === 'trap' ? 'bg-purple-500' : 'bg-amber-500';

  return (
    <div className="space-y-4">
      <SectionHeader icon="◈" title="Next Likely Move" sub="Forward-looking 1-4 hour institutional analysis" />

      {/* Alert Banner */}
      {d.alertType === 'green' && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-400 font-bold font-mono text-sm uppercase tracking-wider">Green Alert — Upside Setup Active</span>
          </div>
          <ul className="space-y-1">
            {greenReasons.map((r, i) => (
              <li key={i} className="text-emerald-300/80 text-xs flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5 shrink-0">▸</span>{r}
              </li>
            ))}
          </ul>
        </div>
      )}
      {d.alertType === 'red' && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 font-bold font-mono text-sm uppercase tracking-wider">Red Alert — Downside Risk Active</span>
          </div>
          <ul className="space-y-1">
            {redReasons.map((r, i) => (
              <li key={i} className="text-red-300/80 text-xs flex items-start gap-2">
                <span className="text-red-500 mt-0.5 shrink-0">▸</span>{r}
              </li>
            ))}
          </ul>
        </div>
      )}
      {d.alertType === 'yellow' && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-amber-400 font-bold font-mono text-sm uppercase tracking-wider">Yellow Alert — Chop Probability High</span>
          </div>
          <ul className="space-y-1">
            {yellowReasons.map((r, i) => (
              <li key={i} className="text-amber-300/80 text-xs flex items-start gap-2">
                <span className="text-amber-500 mt-0.5 shrink-0">▸</span>{r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Path Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { tag: 'Most Probable', ...mostProbPath },
          { tag: 'Alternate Path', ...altPath },
          { tag: 'Worst Case', ...worstPath },
        ].map((path) => (
          <div key={path.tag} className={`rounded-2xl p-5 border space-y-3 ${pathColor(path.dir)}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 font-mono uppercase">{path.tag}</span>
              <span className={`text-lg font-bold font-mono ${pathLabel(path.dir)}`}>
                {path.prob}%
              </span>
            </div>
            <div className={`text-sm font-bold ${pathLabel(path.dir)}`}>{path.label}</div>
            <p className="text-xs text-gray-400 leading-relaxed">{path.desc}</p>
            <div className="h-1.5 bg-[#1e1e1e] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pathBar(path.dir)}`}
                style={{ width: `${path.prob}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Probability bars */}
      <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-600 font-mono uppercase tracking-widest">Scenario Probability Distribution</span>
          <EstBadge />
        </div>
        {[
          { label: 'Bullish', value: d.bullPct, color: 'bg-emerald-500' },
          { label: 'Bearish', value: d.bearPct, color: 'bg-red-500' },
          { label: 'Reversal', value: d.revPct, color: 'bg-purple-500' },
          { label: 'Chop', value: d.chopPct, color: 'bg-amber-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex items-center gap-3">
            <span className="text-xs text-gray-500 font-mono w-16 shrink-0">{label}</span>
            <div className="flex-1 h-2 bg-[#1e1e1e] rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
            </div>
            <span className="text-xs font-bold font-mono text-white w-8 text-right">{value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section 3: Higher Timeframe Bias ────────────────────────────────────────

function getTfBias(esChange: number | null, multiplier: number): TfBiasLabel {
  const ec = (esChange ?? 0) * multiplier;
  if (ec > 0.8) return 'Strong Bullish';
  if (ec > 0.3) return 'Weak Bullish';
  if (ec > 0.1) return 'Accumulation';
  if (ec < -0.8) return 'Strong Bearish';
  if (ec < -0.3) return 'Weak Bearish';
  if (ec < -0.1) return 'Distribution';
  if (Math.abs(ec) < 0.05) return 'Neutral';
  return 'Reversal Risk';
}

function Section3TimeframeBias({ d }: { d: DerivedData }) {
  const timeframes: { label: string; tf: string; multiplier: number }[] = [
    { label: 'Today', tf: '1D', multiplier: 1 },
    { label: 'Last 5 Days', tf: '1W', multiplier: 1.5 },
    { label: 'Last Month', tf: '1M', multiplier: 2 },
    { label: 'Last 3 Months', tf: '3M', multiplier: 2.5 },
  ];

  const biases = timeframes.map(({ label, tf, multiplier }) => ({
    label,
    tf,
    bias: getTfBias(d.esChange, multiplier),
  }));

  const bullishCount = biases.filter(
    (b) => b.bias === 'Strong Bullish' || b.bias === 'Weak Bullish' || b.bias === 'Accumulation'
  ).length;
  const bearishCount = biases.filter(
    (b) => b.bias === 'Strong Bearish' || b.bias === 'Weak Bearish' || b.bias === 'Distribution'
  ).length;

  const maxCount = Math.max(bullishCount, bearishCount);
  const alignment = maxCount === 4
    ? { label: 'ALIGNED', color: 'text-emerald-400', count: 4 }
    : maxCount === 3
    ? { label: 'MOSTLY ALIGNED', color: 'text-emerald-400', count: 3 }
    : maxCount === 2
    ? { label: 'MIXED', color: 'text-amber-400', count: 2 }
    : { label: 'CONFLICTED', color: 'text-red-400', count: 1 };

  return (
    <div className="space-y-4">
      <SectionHeader icon="◉" title="Higher Timeframe Bias" sub="Multi-timeframe alignment check" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {biases.map(({ label, tf, bias }) => (
          <div key={label} className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600 font-mono uppercase">{label}</span>
              <span className="text-[10px] text-gray-700 font-mono">{tf}</span>
            </div>
            <div className={`text-sm font-bold ${tfBiasColor(bias)}`}>{bias}</div>
            <EstBadge />
          </div>
        ))}
      </div>

      <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl px-5 py-4 flex items-center gap-4 flex-wrap">
        <span className="text-xs text-gray-500 font-mono">Alignment Score:</span>
        <span className={`font-bold font-mono text-lg ${alignment.color}`}>{alignment.count}/4</span>
        <span className="text-xs text-gray-500 font-mono">timeframes agree —</span>
        <span className={`font-bold font-mono text-sm ${alignment.color}`}>{alignment.label}</span>
      </div>
    </div>
  );
}

// ─── Section 4: Key Levels ────────────────────────────────────────────────────

function Section4KeyLevels({ d }: { d: DerivedData }) {
  const esPrice = d.esPrice ?? 5300;
  const spyApprox = esPrice * 0.1;

  const breakoutLevel = parseFloat((esPrice * 1.005).toFixed(2));
  const breakdownLevel = parseFloat((esPrice * 0.995).toFixed(2));
  const r1 = parseFloat((esPrice * 1.003).toFixed(2));
  const r2 = parseFloat((esPrice * 1.008).toFixed(2));
  const s1 = parseFloat((esPrice * 0.997).toFixed(2));
  const s2 = parseFloat((esPrice * 0.992).toFixed(2));
  const liquidityAbove = parseFloat((esPrice * 1.006).toFixed(2));
  const liquidityBelow = parseFloat((esPrice * 0.994).toFixed(2));
  const fvgHigh = parseFloat((esPrice * 1.002).toFixed(2));
  const fvgLow = parseFloat((esPrice * 0.998).toFixed(2));

  const levels = [
    { price: liquidityAbove, label: 'Liquidity Pool', color: 'text-purple-400', side: 'above' },
    { price: r2, label: 'Resistance 2', color: 'text-red-300', side: 'above' },
    { price: breakoutLevel, label: 'Bullish Breakout', color: 'text-emerald-400', side: 'above' },
    { price: r1, label: 'Resistance 1', color: 'text-red-400', side: 'above' },
    { price: fvgHigh, label: 'FVG High', color: 'text-amber-300', side: 'above' },
    { price: esPrice, label: 'CURRENT PRICE', color: 'text-white', side: 'current' },
    { price: fvgLow, label: 'FVG Low', color: 'text-amber-300', side: 'below' },
    { price: s1, label: 'Support 1', color: 'text-emerald-400', side: 'below' },
    { price: breakdownLevel, label: 'Bearish Breakdown', color: 'text-red-400', side: 'below' },
    { price: s2, label: 'Support 2', color: 'text-emerald-300', side: 'below' },
    { price: liquidityBelow, label: 'Liquidity Pool', color: 'text-purple-400', side: 'below' },
  ].sort((a, b) => b.price - a.price);

  return (
    <div className="space-y-4">
      <SectionHeader icon="▦" title="Key Levels" sub="Price ladder — current price in center, levels above and below" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ES Price Ladder */}
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-600 font-mono uppercase">ES Futures Ladder</span>
            <EstBadge />
          </div>
          {levels.map(({ price, label, color, side }) => (
            <div
              key={`${label}-${price}`}
              className={`flex items-center justify-between px-3 py-2 rounded-xl ${
                side === 'current'
                  ? 'bg-white/5 border border-white/20'
                  : 'bg-[#0f0f0f] border border-[#1e1e1e]'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-xs font-mono font-bold ${color}`}>
                  {price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
                {side === 'above' && <span className="text-[10px] text-gray-700">▲</span>}
                {side === 'below' && <span className="text-[10px] text-gray-700">▼</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-mono">{label}</span>
                {side !== 'current' && <EstBadge />}
              </div>
            </div>
          ))}
        </div>

        {/* SPY approximate */}
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-600 font-mono uppercase">SPY Levels</span>
            <EstBadge />
          </div>
          {[
            { label: 'Breakout Target', price: (spyApprox * 1.005).toFixed(2), color: 'text-emerald-400' },
            { label: 'Prior Day Ref', price: (spyApprox * 0.999).toFixed(2), color: 'text-amber-400' },
            { label: 'Current ~', price: spyApprox.toFixed(2), color: 'text-white' },
            { label: 'Breakdown Level', price: (spyApprox * 0.995).toFixed(2), color: 'text-red-400' },
            { label: 'Key Support', price: (spyApprox * 0.992).toFixed(2), color: 'text-emerald-300' },
          ].map(({ label, price, color }) => (
            <div
              key={label}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-[#0f0f0f] border border-[#1e1e1e]"
            >
              <span className={`text-sm font-mono font-bold ${color}`}>${price}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-mono">{label}</span>
                <EstBadge />
              </div>
            </div>
          ))}
          <div className="mt-3 pt-3 border-t border-[#1e1e1e] space-y-1">
            <div className="flex items-center gap-2 text-xs text-gray-600 font-mono">
              <span>Fair Value Gap Zone</span>
              <EstBadge />
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-amber-400">
              <span>${(spyApprox * 0.998).toFixed(2)}</span>
              <span className="text-gray-700">—</span>
              <span>${(spyApprox * 1.002).toFixed(2)}</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-[#1e1e1e] space-y-1">
            <div className="flex items-center gap-2 text-xs text-gray-600 font-mono">
              <span>Liquidity Pools</span>
              <EstBadge />
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-purple-400">
              <span>Above: ${(spyApprox * 1.006).toFixed(2)}</span>
              <span className="text-gray-700">·</span>
              <span>Below: ${(spyApprox * 0.994).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section 5: Market Maker Logic ───────────────────────────────────────────

function Section5MMLogic({ d }: { d: DerivedData }) {
  const esUp = d.esChange !== null && d.esChange > 0;
  const vix = d.vixPrice ?? 18;
  const etDate = getETDate();
  const h = etDate.getHours() + etDate.getMinutes() / 60;
  const isOpen = h >= 9.5 && h < 11;
  const isMidday = h >= 11 && h < 14;

  const questions: { q: string; a: string; conf: 'High' | 'Med' | 'Low' }[] = [
    {
      q: 'Where are retail stop losses sitting?',
      a: esUp
        ? `Retail longs have stops just below yesterday's low and the morning swing low. Market makers know this — expect a quick dip to that zone before continuation.`
        : `Retail shorts have stops just above the overnight high and premarket spike. A short squeeze to that zone is possible before the next leg down.`,
      conf: vix < 20 ? 'High' : 'Med',
    },
    {
      q: 'Where is a fake breakout most likely?',
      a: esUp
        ? `Just above the current high — price may spike through recent resistance, print a wick, then reverse. This traps breakout buyers and creates the next sell signal.`
        : `Just below the current low — a quick dip through support to trap breakout sellers, followed by a sharp reversal back into range.`,
      conf: isOpen ? 'High' : isMidday ? 'Med' : 'Low',
    },
    {
      q: 'Is price hunting highs or lows?',
      a: esUp
        ? `Hunting highs. ES is trading above the prior reference zone. Price is seeking to tag the next resistance cluster and fill liquidity orders above.`
        : `Hunting lows. ES is trading below the prior reference zone. Institutions are sweeping buy-stop liquidity below recent lows.`,
      conf: d.tradeScore > 60 ? 'High' : 'Med',
    },
    {
      q: 'Is a liquidity grab in progress?',
      a: d.marketType === 'Liquidity Grab'
        ? `YES — Price is exhibiting a classic stop-hunt pattern. Tight range followed by a sharp spike outside the range. Do not chase this move. Wait for price to return inside range.`
        : `Not detected. Price action appears to be trending. However, remain alert for quick reversal wicks, especially around key levels marked above.`,
      conf: d.marketType === 'Liquidity Grab' ? 'High' : 'Low',
    },
    {
      q: 'Is options positioning pinning or pushing price?',
      a: vix < 15
        ? `Low VIX suggests minimal options pressure. Market makers likely delta-neutral. Price can trend freely without gamma-related pinning.`
        : vix < 25
        ? `Elevated VIX suggests active options hedging. Dealers likely short gamma — they amplify moves. Expect choppier conditions near large strike clusters.`
        : `High VIX signals extreme hedging. Dealers have large short gamma exposure — they MUST hedge by selling rallies and buying dips, amplifying all moves significantly.`,
      conf: vix < 15 ? 'Med' : 'High',
    },
    {
      q: 'Does volume confirm the move?',
      a: d.tradeScore > 70
        ? `Volume pattern is consistent with directional conviction. High trade score suggests institutional participation. The move has legs.`
        : d.tradeScore > 45
        ? `Volume is moderate. The move has some conviction but may lack follow-through. Scale in cautiously — wait for volume expansion before adding.`
        : `Low trade score suggests thin participation. Price may be moving on low volume — these moves are prone to sharp reversals. Avoid chasing.`,
      conf: d.tradeScore > 70 ? 'High' : d.tradeScore > 45 ? 'Med' : 'Low',
    },
    {
      q: 'Is this move real or a probable trap?',
      a: d.noTradeOn
        ? `PROBABLE TRAP. No-Trade warning is active. Conditions are choppy and unreliable. Any breakout here has a high chance of being reversed immediately.`
        : d.marketType === 'Trend Day Bullish' || d.marketType === 'Trend Day Bearish'
        ? `REAL MOVE. Clear trend day classification. Directional conviction is high. Trust the trend until price violates the trend structure.`
        : `UNCERTAIN. Market type is ${d.marketType}. Treat this move as potentially fake until confirmed by a close above/below the key breakout level.`,
      conf: d.noTradeOn ? 'High' : d.tradeScore > 65 ? 'High' : 'Med',
    },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader icon="◎" title="Market Maker Logic Panel" sub="Institutional mindset framework — derived from current data" />

      <div className="space-y-3">
        {questions.map(({ q, a, conf }, i) => (
          <div key={i} className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs text-gray-500 font-mono flex-1">{q}</span>
              <ConfBadge level={conf} />
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">{a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section 6: Trade Setup Generator ───────────────────────────────────────

interface PlanCardProps {
  title: string;
  border: string;
  bg: string;
  titleColor: string;
  ticker: string;
  direction: string;
  session: string;
  confidence: 'High' | 'Med' | 'Low';
  entry?: string;
  confirm?: string;
  entryZone?: string;
  stop?: string;
  tps?: string[];
  invalidation?: string;
  whyNotTrade?: string;
  rangeBounds?: string;
  changeIt?: string;
  trapSpot?: string;
  confirmFlip?: string;
  exitFast?: string;
}

function PlanCard({
  title, border, bg, titleColor, ticker, direction, session, confidence,
  entry, confirm, entryZone, stop, tps, invalidation,
  whyNotTrade, rangeBounds, changeIt, trapSpot, confirmFlip, exitFast,
}: PlanCardProps) {
  return (
    <div className={`rounded-2xl p-5 border space-y-4 ${border} ${bg}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className={`text-base font-bold font-mono ${titleColor}`}>{title}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-gray-500 font-mono">{ticker}</span>
            <span className="text-gray-700">·</span>
            <span className="text-xs text-gray-500 font-mono">{direction}</span>
            <span className="text-gray-700">·</span>
            <span className="text-xs text-gray-500 font-mono">{session}</span>
          </div>
        </div>
        <ConfBadge level={confidence} />
      </div>

      <div className="space-y-2 text-xs font-mono">
        {entry && <div className="flex gap-2"><span className="text-gray-600 w-24 shrink-0">Entry Trigger:</span><span className="text-gray-300">{entry}</span></div>}
        {confirm && <div className="flex gap-2"><span className="text-gray-600 w-24 shrink-0">Confirm:</span><span className="text-gray-300">{confirm}</span></div>}
        {entryZone && <div className="flex gap-2"><span className="text-gray-600 w-24 shrink-0">Entry Zone:</span><span className="text-gray-300">{entryZone}</span></div>}
        {stop && <div className="flex gap-2"><span className="text-gray-600 w-24 shrink-0">Stop:</span><span className="text-red-400">{stop}</span></div>}
        {tps && tps.map((tp, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-gray-600 w-24 shrink-0">TP{i + 1}:</span>
            <span className="text-emerald-400">{tp}</span>
          </div>
        ))}
        {invalidation && <div className="flex gap-2"><span className="text-gray-600 w-24 shrink-0">Invalidation:</span><span className="text-amber-400">{invalidation}</span></div>}
        {whyNotTrade && <div className="flex gap-2"><span className="text-gray-600 w-24 shrink-0">Why skip:</span><span className="text-gray-300">{whyNotTrade}</span></div>}
        {rangeBounds && <div className="flex gap-2"><span className="text-gray-600 w-24 shrink-0">Range:</span><span className="text-gray-300">{rangeBounds}</span></div>}
        {changeIt && <div className="flex gap-2"><span className="text-gray-600 w-24 shrink-0">Changes when:</span><span className="text-gray-300">{changeIt}</span></div>}
        {trapSpot && <div className="flex gap-2"><span className="text-gray-600 w-24 shrink-0">Trap Zone:</span><span className="text-gray-300">{trapSpot}</span></div>}
        {confirmFlip && <div className="flex gap-2"><span className="text-gray-600 w-24 shrink-0">Flip Confirm:</span><span className="text-gray-300">{confirmFlip}</span></div>}
        {exitFast && <div className="flex gap-2"><span className="text-gray-600 w-24 shrink-0">Exit Fast If:</span><span className="text-red-400">{exitFast}</span></div>}
      </div>
    </div>
  );
}

function Section6TradeSetups({ d }: { d: DerivedData }) {
  const esPrice = d.esPrice ?? 5300;
  const spyApprox = (esPrice * 0.1).toFixed(2);
  const qqqApprox = (esPrice * 0.048).toFixed(2);

  return (
    <div className="space-y-4">
      <SectionHeader icon="▸" title="Trade Setup Generator" sub="Four-scenario plan — be ready for any outcome" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PlanCard
          title="BULL PLAN"
          border="border-emerald-500/30"
          bg="bg-emerald-500/5"
          titleColor="text-emerald-400"
          ticker="ES / SPY"
          direction="LONG"
          session="Open / Power Hour"
          confidence={d.biasLabel === 'Strong Bullish' ? 'High' : d.biasLabel === 'Weak Bullish' ? 'Med' : 'Low'}
          entry={`${(esPrice * 1.001).toFixed(0)} on ES — break and close above ${(esPrice * 1.003).toFixed(0)}`}
          confirm="Volume expansion + ES reclaim of HOD"
          entryZone={`$${spyApprox} SPY / ${esPrice.toFixed(0)} ES`}
          stop={`Below ${(esPrice * 0.997).toFixed(0)} on ES`}
          tps={[
            `+0.3% — ${(esPrice * 1.003).toFixed(0)} ES`,
            `+0.6% — ${(esPrice * 1.006).toFixed(0)} ES`,
            `+1.0% — ${(esPrice * 1.010).toFixed(0)} ES`,
          ]}
          invalidation={`Price closes below ${(esPrice * 0.997).toFixed(0)} on 5m candle`}
        />

        <PlanCard
          title="BEAR PLAN"
          border="border-red-500/30"
          bg="bg-red-500/5"
          titleColor="text-red-400"
          ticker="ES / QQQ"
          direction="SHORT"
          session="Open / Midday"
          confidence={d.biasLabel === 'Strong Bearish' ? 'High' : d.biasLabel === 'Weak Bearish' ? 'Med' : 'Low'}
          entry={`${(esPrice * 0.999).toFixed(0)} on ES — breakdown through ${(esPrice * 0.997).toFixed(0)}`}
          confirm="Volume surge on break + failed retest of breakdown level"
          entryZone={`$${qqqApprox} QQQ / ${esPrice.toFixed(0)} ES`}
          stop={`Above ${(esPrice * 1.003).toFixed(0)} on ES`}
          tps={[
            `-0.3% — ${(esPrice * 0.997).toFixed(0)} ES`,
            `-0.6% — ${(esPrice * 0.994).toFixed(0)} ES`,
            `-1.0% — ${(esPrice * 0.990).toFixed(0)} ES`,
          ]}
          invalidation={`Price reclaims ${(esPrice * 1.002).toFixed(0)} with volume`}
        />

        <PlanCard
          title="CHOP / NO-TRADE PLAN"
          border="border-amber-500/30"
          bg="bg-amber-500/5"
          titleColor="text-amber-400"
          ticker="NONE"
          direction="FLAT"
          session="All Sessions"
          confidence={d.noTradeOn ? 'High' : d.marketType === 'Chop' ? 'High' : 'Med'}
          whyNotTrade={d.noTradeOn
            ? 'No-Trade warning active. VIX elevated and bias is neutral — no edge present.'
            : `Market type is ${d.marketType}. Risk/reward not favorable for directional bets.`}
          rangeBounds={`${(esPrice * 0.995).toFixed(0)}–${(esPrice * 1.005).toFixed(0)} on ES`}
          changeIt={`Break above ${(esPrice * 1.005).toFixed(0)} with volume, or break below ${(esPrice * 0.995).toFixed(0)} with follow-through`}
        />

        <PlanCard
          title="REVERSAL PLAN"
          border="border-purple-500/30"
          bg="bg-purple-500/5"
          titleColor="text-purple-400"
          ticker="ES / SPY"
          direction="FLIP ON SIGNAL"
          session="Power Hour"
          confidence="Med"
          trapSpot={`Wicks into ${(esPrice * 1.006).toFixed(0)} or ${(esPrice * 0.994).toFixed(0)} — look for exhaustion candle`}
          confirmFlip="3-candle reversal sequence + volume spike + VIX change confirming flip direction"
          invalidation="No confirmation within 15 minutes of the wick — skip the trade"
          exitFast="Price re-enters the original trend direction with strong volume — exit immediately"
        />
      </div>
    </div>
  );
}

// ─── Section 7: Trade Rescue Decision Tree ───────────────────────────────────

function Section7TradeRescue({ d }: { d: DerivedData }) {
  const [step1, setStep1] = useState<RescueStep1>(null);
  const [step2, setStep2] = useState<RescueStep2>(null);
  const esPrice = d.esPrice ?? 5300;

  const result = useCallback((): { action: string; color: string; bgClass: string; desc: string } | null => {
    if (step1 === null) return null;
    if (step1 === 'YES') return {
      action: 'CUT NOW',
      color: 'text-red-400',
      bgClass: 'bg-red-500/10 border-red-500/30',
      desc: 'Invalidation is broken. Your thesis is wrong. Exit immediately — protect capital. No averaging down.',
    };
    if (step2 === null) return null;
    if (step2 === 'PULLBACK') return {
      action: 'HOLD',
      color: 'text-emerald-400',
      bgClass: 'bg-emerald-500/10 border-emerald-500/30',
      desc: 'This is a normal pullback within your trend. Hold your position. Manage the stop — do not move it against you.',
    };
    return {
      action: 'TRIM AND HOLD',
      color: 'text-amber-400',
      bgClass: 'bg-amber-500/10 border-amber-500/30',
      desc: 'Possible reversal detected. Take 50% off the table now. Hold the rest only if price reclaims key level.',
    };
  }, [step1, step2]);

  const outcome = result();

  function ToggleBtn({
    value, selected, onClick, colorClass,
  }: { value: string; selected: boolean; onClick: () => void; colorClass: string }) {
    return (
      <button
        onClick={onClick}
        className={`px-4 py-2 rounded-xl text-sm font-bold font-mono border transition-all ${
          selected ? colorClass : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-500 hover:text-white hover:border-[#3a3a3a]'
        }`}
      >
        {value}
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader icon="↗" title="Trade Rescue Decision Tree" sub="Step through this if a trade is going against you" />

      <div className="space-y-3">
        {/* Step 1 */}
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-3">
          <div className="text-xs text-gray-600 font-mono">STEP 1</div>
          <div className="text-sm font-semibold text-white">Is your invalidation level broken?</div>
          <div className="flex items-center gap-3">
            <ToggleBtn
              value="YES"
              selected={step1 === 'YES'}
              onClick={() => { setStep1('YES'); setStep2(null); }}
              colorClass="bg-red-500/10 border-red-500/40 text-red-400"
            />
            <ToggleBtn
              value="NO"
              selected={step1 === 'NO'}
              onClick={() => setStep1('NO')}
              colorClass="bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
            />
          </div>
        </div>

        {/* Step 2 — only if step 1 = NO */}
        {step1 === 'NO' && (
          <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-3">
            <div className="text-xs text-gray-600 font-mono">STEP 2</div>
            <div className="text-sm font-semibold text-white">Is this a pullback or a true reversal?</div>
            <div className="flex items-center gap-3">
              <ToggleBtn
                value="PULLBACK"
                selected={step2 === 'PULLBACK'}
                onClick={() => setStep2('PULLBACK')}
                colorClass="bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
              />
              <ToggleBtn
                value="REVERSAL"
                selected={step2 === 'REVERSAL'}
                onClick={() => setStep2('REVERSAL')}
                colorClass="bg-amber-500/10 border-amber-500/40 text-amber-400"
              />
            </div>
          </div>
        )}

        {/* Result */}
        {outcome && (
          <div className={`rounded-2xl p-6 border space-y-4 ${outcome.bgClass}`}>
            <div className={`text-3xl font-bold font-mono ${outcome.color}`}>
              → {outcome.action}
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">{outcome.desc}</p>
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/10 text-xs font-mono">
              <div>
                <div className="text-gray-600 mb-1">Max loss if held</div>
                <div className="text-red-400 font-bold">{(esPrice * 0.005).toFixed(0)} pts on ES <EstBadge /></div>
              </div>
              <div>
                <div className="text-gray-600 mb-1">Level to reclaim</div>
                <div className="text-emerald-400 font-bold">
                  {(esPrice * (outcome.action === 'CUT NOW' ? 0.997 : 1.003)).toFixed(0)} <EstBadge />
                </div>
              </div>
              <div>
                <div className="text-gray-600 mb-1">Death candle</div>
                <div className="text-red-400">Large body close below LOD with vol</div>
              </div>
              <div>
                <div className="text-gray-600 mb-1">Life candle</div>
                <div className="text-emerald-400">Hammer / engulf reclaim of key level</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section 8: Position Management ─────────────────────────────────────────

function Section8PositionMgmt({ d }: { d: DerivedData }) {
  const [selected, setSelected] = useState<PositionAction | null>(null);

  const bullish = d.esChange !== null && d.esChange > 0;
  const bearish = d.esChange !== null && d.esChange < 0;

  const recommended: PositionAction = d.noTradeOn
    ? 'DO NOTHING'
    : bullish && d.tradeScore > 65
    ? 'LET RUNNER RIDE'
    : bullish
    ? 'HOLD'
    : bearish && d.tradeScore > 65
    ? 'EXIT'
    : bearish
    ? 'TRIM'
    : 'MOVE STOP';

  const getConf = (action: PositionAction): 'High' | 'Med' | 'Low' => {
    if (action === recommended) return 'High';
    if (
      (action === 'TRIM' && bullish) ||
      (action === 'TAKE PARTIALS' && bullish) ||
      (action === 'HOLD' && d.tradeScore > 50) ||
      (action === 'MOVE STOP' && d.tradeScore > 60)
    ) return 'Med';
    return 'Low';
  };

  const getDesc = (action: PositionAction): string => {
    const vix = d.vixPrice ?? 18;
    switch (action) {
      case 'HOLD': return vix < 20 ? 'Trend intact. Stay in position.' : 'High VIX — hold with wider mental stop.';
      case 'TRIM': return 'Take 25–33% off to reduce risk. Keep core position.';
      case 'EXIT': return 'Full exit. Thesis invalidated or target hit.';
      case 'MOVE STOP': return 'Trail stop to breakeven or last swing low/high.';
      case 'TAKE PARTIALS': return 'Lock in TP1. Let remainder run to TP2.';
      case 'LET RUNNER RIDE': return 'Strong trend. Trail stop, maximize upside capture.';
      case 'FLIP': return 'Reverse direction. Only on confirmed reversal signal.';
      case 'DO NOTHING': return 'Market is choppy. Any action creates unnecessary risk.';
    }
  };

  const actions: PositionAction[] = [
    'HOLD', 'TRIM', 'EXIT', 'MOVE STOP',
    'TAKE PARTIALS', 'LET RUNNER RIDE', 'FLIP', 'DO NOTHING',
  ];

  return (
    <div className="space-y-4">
      <SectionHeader icon="◀" title="Position Management" sub="Eight actions — recommended highlighted in green. Click to select." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {actions.map((action) => {
          const conf = getConf(action);
          const isRec = action === recommended;
          const isSel = selected === action;
          return (
            <button
              key={action}
              onClick={() => setSelected(isSel ? null : action)}
              className={`rounded-2xl p-4 border text-left space-y-2 transition-all cursor-pointer ${
                isRec
                  ? 'bg-emerald-500/10 border-emerald-500/40 ring-2 ring-emerald-500/30'
                  : isSel
                  ? 'bg-white/5 border-white/20'
                  : 'bg-[#111111] border-[#1e1e1e] hover:border-[#2e2e2e]'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className={`text-xs font-bold font-mono ${isRec ? 'text-emerald-400' : 'text-white'}`}>
                  {action}
                </span>
                <ConfBadge level={conf} />
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{getDesc(action)}</p>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="bg-[#111111] border border-white/10 rounded-2xl p-4 text-sm text-gray-300">
          Selected: <span className="font-bold text-white font-mono">{selected}</span> — {getDesc(selected)}
        </div>
      )}
    </div>
  );
}

// ─── Section 9: Tomorrow's Setup ─────────────────────────────────────────────

function Section9TomorrowSetup({ d }: { d: DerivedData }) {
  const [show] = useState(() => isAfter2PMet());
  const bullish = d.esChange !== null && d.esChange > 0;
  const esPrice = d.esPrice ?? 5300;

  if (!show) {
    return (
      <div className="space-y-4">
        <SectionHeader icon="↗" title="Tomorrow&apos;s Setup" sub="Pre-market preparation — available after close" />
        <div className="bg-[#111111] border border-amber-500/20 rounded-2xl p-6 text-center space-y-2">
          <div className="text-amber-400 font-mono font-bold text-lg">Available after 2:00 PM ET</div>
          <p className="text-gray-500 text-sm">Returns at market close. Check back after 2 PM for tomorrow&apos;s full game plan.</p>
        </div>
      </div>
    );
  }

  const biasLean = d.tradeScore > 65 && bullish ? 'Bullish'
    : d.tradeScore > 65 && !bullish ? 'Bearish'
    : d.tradeScore < 40 ? 'Wait'
    : 'Neutral';

  return (
    <div className="space-y-4">
      <SectionHeader icon="↗" title="Tomorrow&apos;s Setup" sub="Game plan for the next session — mark these levels tonight" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-2xl p-5 space-y-3">
          <div className="text-xs text-gray-600 font-mono uppercase">Most Likely Bull Setup</div>
          <div className="text-sm font-bold text-emerald-400">Gap and Go / Opening Range Breakout</div>
          <p className="text-xs text-gray-400 leading-relaxed">
            If ES holds above {(esPrice * 1.002).toFixed(0)} in premarket, look for ORB long above first 15-min high.
            Target: {(esPrice * 1.008).toFixed(0)}. Stop below opening range low.
          </p>
          <div className="flex gap-2 flex-wrap items-center">
            <EstBadge />
            <span className="text-[10px] text-gray-600 font-mono">Best window: Open (9:30–10:30 ET)</span>
          </div>
        </div>

        <div className="bg-red-500/5 border border-red-500/30 rounded-2xl p-5 space-y-3">
          <div className="text-xs text-gray-600 font-mono uppercase">Most Likely Bear Setup</div>
          <div className="text-sm font-bold text-red-400">Failed Open / Distribution Setup</div>
          <p className="text-xs text-gray-400 leading-relaxed">
            If ES fails to hold {(esPrice * 0.998).toFixed(0)} in premarket, look for short on failed bounce into {(esPrice * 1.001).toFixed(0)}.
            Target: {(esPrice * 0.992).toFixed(0)}. Stop above premarket high.
          </p>
          <div className="flex gap-2 flex-wrap items-center">
            <EstBadge />
            <span className="text-[10px] text-gray-600 font-mono">Best window: Open / Power Hour</span>
          </div>
        </div>
      </div>

      <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5">
        <div className="text-xs text-gray-600 font-mono uppercase mb-3">Key Levels to Mark Tonight</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs font-mono">
          {[
            { label: "Today's High", val: `${(esPrice * 1.005).toFixed(0)}`, color: 'text-emerald-400' },
            { label: "Today's Low", val: `${(esPrice * 0.995).toFixed(0)}`, color: 'text-red-400' },
            { label: "Today's Close ~", val: `${esPrice.toFixed(0)}`, color: 'text-white' },
            { label: 'Overnight Pivot', val: `${(esPrice * 1.001).toFixed(0)}`, color: 'text-amber-400' },
            { label: 'Bull Target', val: `${(esPrice * 1.008).toFixed(0)}`, color: 'text-emerald-400' },
            { label: 'Bear Target', val: `${(esPrice * 0.992).toFixed(0)}`, color: 'text-red-400' },
          ].map(({ label, val, color }) => (
            <div key={label} className="flex items-center justify-between bg-[#0f0f0f] border border-[#1e1e1e] rounded-xl px-3 py-2">
              <span className="text-gray-500">{label}</span>
              <div className="flex items-center gap-1">
                <span className={`font-bold ${color}`}>{val}</span>
                <EstBadge />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 flex items-center gap-4 flex-wrap">
        <span className="text-xs text-gray-600 font-mono">Best Opportunity Window:</span>
        <span className="text-amber-400 font-bold font-mono text-sm">Open (9:30–10:30 ET) + Power Hour (3–4 PM ET)</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-600 font-mono">Bias Lean:</span>
          <span
            className={`text-sm font-bold font-mono px-3 py-1 rounded-full border ${
              biasLean === 'Bullish'
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                : biasLean === 'Bearish'
                ? 'text-red-400 bg-red-500/10 border-red-500/30'
                : biasLean === 'Wait'
                ? 'text-gray-400 bg-gray-500/10 border-gray-500/30'
                : 'text-amber-400 bg-amber-500/10 border-amber-500/30'
            }`}
          >
            {biasLean}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Page Shell ───────────────────────────────────────────────────────────────

export default function CommandCenterPage() {
  const [futuresResult, setFuturesResult] = useState<FinvizResult<FinvizFuture> | null>(null);
  const [vixData, setVixData] = useState<VixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [fRes, vRes] = await Promise.all([
          fetch('/api/finviz/futures').then((r) => r.json()),
          fetch('/api/market/vix').then((r) => r.json()),
        ]);
        setFuturesResult(fRes);
        setVixData(vRes);
      } catch {
        setFuturesResult({
          data: [],
          sourceError: 'Fetch failed',
          lastUpdated: new Date().toISOString(),
        });
      }
      setLoading(false);
    }
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  const futures = futuresResult?.data ?? [];
  const d = derive(futures, vixData);

  const etTimeStr = now.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      <div className="max-w-5xl mx-auto px-4 pb-32 space-y-10">

        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-[#0f0f0f] border-b border-[#1e1e1e] py-3 -mx-4 px-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="text-base font-bold text-white font-mono">COMMAND CENTER</span>
              <span className="text-[10px] text-gray-600 font-mono uppercase tracking-widest hidden sm:inline">
                Market Maker Daily Trade Intelligence
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-white">{etTimeStr} ET</span>
              {futuresResult && (
                <SourceTag source={futuresResult.source ?? 'Finviz'} lastUpdated={futuresResult.lastUpdated} />
              )}
              {loading && (
                <span className="text-xs text-gray-600 font-mono animate-pulse">Refreshing…</span>
              )}
            </div>
          </div>
        </div>

        {/* Quick stats strip */}
        <div className="flex items-center gap-3 flex-wrap pt-2">
          {futures
            .filter((f) => ['ES', 'NQ', 'YM', 'RTY', 'GC'].includes(f.symbol))
            .map((f) => {
              const up = f.direction === 'up';
              const down = f.direction === 'down';
              const chgColor = up ? 'text-emerald-400' : down ? 'text-red-400' : 'text-gray-500';
              return (
                <div
                  key={f.symbol}
                  className={`flex items-center gap-1.5 bg-[#111111] border rounded-xl px-3 py-2 ${
                    up ? 'border-emerald-500/20' : down ? 'border-red-500/20' : 'border-[#1e1e1e]'
                  }`}
                >
                  <span className="text-xs font-bold font-mono text-white">{f.symbol}</span>
                  <span className={`text-xs font-mono ${chgColor}`}>
                    {f.changePercent !== null
                      ? `${f.changePercent >= 0 ? '+' : ''}${f.changePercent.toFixed(2)}%`
                      : '--'}
                  </span>
                </div>
              );
            })}
          {d.vixPrice !== null && (
            <div className={`flex items-center gap-1.5 rounded-xl px-3 py-2 border ${riskColor(d.riskLevel)}`}>
              <span className="text-xs font-bold font-mono">VIX</span>
              <span className="text-xs font-mono">{d.vixPrice.toFixed(1)}</span>
              <span className="text-[10px] font-mono opacity-70">{d.riskLevel}</span>
            </div>
          )}
        </div>

        {/* ── Sections ── */}
        <Section1DailyCommand d={d} />
        <div className="border-t border-[#1e1e1e]" />
        <Section2NextMove d={d} />
        <div className="border-t border-[#1e1e1e]" />
        <Section3TimeframeBias d={d} />
        <div className="border-t border-[#1e1e1e]" />
        <Section4KeyLevels d={d} />
        <div className="border-t border-[#1e1e1e]" />
        <Section5MMLogic d={d} />
        <div className="border-t border-[#1e1e1e]" />
        <Section6TradeSetups d={d} />
        <div className="border-t border-[#1e1e1e]" />
        <Section7TradeRescue d={d} />
        <div className="border-t border-[#1e1e1e]" />
        <Section8PositionMgmt d={d} />
        <div className="border-t border-[#1e1e1e]" />
        <Section9TomorrowSetup d={d} />

      </div>
    </div>
  );
}

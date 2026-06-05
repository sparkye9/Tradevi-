'use client';
import { useEffect, useState, useCallback } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import type { FinvizFuture, FinvizResult } from '@/lib/finviz';

type Session = 'Asia' | 'London' | 'NY' | 'After Hours';
type RangeState = 'Compressed' | 'Normal' | 'Expanded';
type Timeframe = '1m' | '5m' | '10m' | '15m' | '30m';
type SessionWindow = 'Premarket' | 'Open' | 'Midday' | 'Power Hour' | 'Other';

type RegimeType =
  | 'TRENDING'
  | 'BALANCED'
  | 'COMPRESSION'
  | 'EXPANSION'
  | 'RANGING'
  | 'HIGH VOLATILITY'
  | 'LOW LIQUIDITY'
  | 'UNKNOWN';

type GradeLetter = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

function getETDate(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

function getSession(etDate: Date): Session {
  const h = etDate.getHours() + etDate.getMinutes() / 60;
  if (h >= 18 || h < 2) return 'Asia';
  if (h >= 2 && h < 8) return 'London';
  if (h >= 8 && h < 17) return 'NY';
  return 'After Hours';
}

function getSessionWindow(etDate: Date): SessionWindow {
  const h = etDate.getHours();
  const m = etDate.getMinutes();
  const totalMin = h * 60 + m;
  if (totalMin >= 4 * 60 && totalMin < 9 * 60 + 30) return 'Premarket';
  if (totalMin >= 9 * 60 + 30 && totalMin < 10 * 60 + 30) return 'Open';
  if (totalMin >= 10 * 60 + 30 && totalMin < 14 * 60) return 'Midday';
  if (totalMin >= 15 * 60 && totalMin < 16 * 60) return 'Power Hour';
  return 'Other';
}

function getNextSessionTime(etDate: Date): { label: string; secsRemaining: number } {
  const h = etDate.getHours();
  const m = etDate.getMinutes();
  const s = etDate.getSeconds();
  const totalSec = h * 3600 + m * 60 + s;
  const sessions: { label: string; startSec: number }[] = [
    { label: 'London Open', startSec: 2 * 3600 },
    { label: 'NY Open',     startSec: 8 * 3600 },
    { label: 'Asia Open',   startSec: 18 * 3600 },
  ];
  for (const sess of sessions) {
    if (totalSec < sess.startSec) {
      return { label: sess.label, secsRemaining: sess.startSec - totalSec };
    }
  }
  return { label: 'Asia Open', secsRemaining: 86400 - totalSec + 2 * 3600 };
}

function fmtCountdown(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getRegime(esChange: number | null): RegimeType {
  if (esChange === null) return 'UNKNOWN';
  const abs = Math.abs(esChange);
  if (esChange > 0.5 || esChange < -0.5) return 'TRENDING';
  if (abs < 0.1) return 'COMPRESSION';
  if (abs >= 0.1 && abs < 0.3) return 'BALANCED';
  return 'RANGING';
}

function getRangeState(esChange: number | null): RangeState {
  if (esChange === null) return 'Normal';
  const abs = Math.abs(esChange);
  if (abs < 0.1) return 'Compressed';
  if (abs > 0.5) return 'Expanded';
  return 'Normal';
}

const REGIME_INFO: Record<RegimeType, { approach: string; avoid: string; color: 'green' | 'amber' | 'red'; action: string }> = {
  TRENDING:          { approach: 'Trade with momentum. Trend continuation entries.',        avoid: 'Counter-trend fades. Mean reversion bets.',        color: 'green', action: 'TRADE' },
  BALANCED:          { approach: 'Select setups carefully. Wait for confirmation.',         avoid: 'Forcing trades. Premature entries.',                color: 'amber', action: 'CAUTION' },
  COMPRESSION:       { approach: 'Wait for range expansion. No directional bets.',         avoid: 'Premature breakouts. Chasing wicks.',              color: 'amber', action: 'CAUTION' },
  EXPANSION:         { approach: 'Ride the move. Trail stops aggressively.',               avoid: 'Early profit-taking. Reversals against momentum.', color: 'green', action: 'TRADE' },
  RANGING:           { approach: 'Fade extremes. Buy support, sell resistance.',           avoid: 'Breakout chasing. Holding through the range.',     color: 'amber', action: 'CAUTION' },
  'HIGH VOLATILITY': { approach: 'Reduce size. Wider stops. Wait for calm.',              avoid: 'Normal sizing. Tight stops.',                      color: 'red',   action: 'STAND ASIDE' },
  'LOW LIQUIDITY':   { approach: 'Reduce size. Wider spreads expected.',                  avoid: 'Large positions. Expecting normal fills.',          color: 'red',   action: 'STAND ASIDE' },
  UNKNOWN:           { approach: 'Gather more data before committing.',                   avoid: 'Trading without confirmation.',                    color: 'red',   action: 'STAND ASIDE' },
};

const STRATEGY_INFO: Partial<Record<RegimeType, { name: string; rationale: string }>> = {
  TRENDING:    { name: 'Trend Continuation', rationale: 'Market showing directional conviction. Trail entries in direction of momentum.' },
  COMPRESSION: { name: 'NO TRADE',           rationale: 'Range too tight for reliable breakouts. Wait for expansion.' },
  RANGING:     { name: 'Mean Reversion',     rationale: 'Price oscillating between levels. Fade extremes with tight stops.' },
  BALANCED:    { name: 'Pullback Entry',     rationale: 'Moderate trend present. Wait for pullbacks to key levels.' },
  EXPANSION:   { name: 'ORB Breakout',       rationale: 'Volatility expanding. Breakout trades favored with momentum.' },
};

interface BiasFactors {
  vwap: number;
  emaTrend: number;
  rsi: number;
  orb: number;
  volume: number;
  vix: number;
  momentum: number;
  breadth: number;
}

function computeBias(futures: FinvizFuture[], etDate: Date): BiasFactors {
  const es = futures.find((f) => f.symbol === 'ES');
  const nq = futures.find((f) => f.symbol === 'NQ');
  const esChg = es?.changePercent ?? null;
  const nqChg = nq?.changePercent ?? null;
  const totalMin = etDate.getHours() * 60 + etDate.getMinutes();

  let emaTrend = 5;
  if (esChg !== null) {
    if (esChg > 0.3) emaTrend = 8;
    else if (esChg > 0.1) emaTrend = 7;
    else if (esChg < -0.3) emaTrend = 2;
    else if (esChg < -0.1) emaTrend = 3;
    else emaTrend = 5;
  }

  let momentum = 5;
  if (esChg !== null) {
    const abs = Math.abs(esChg);
    if (abs > 0.5) momentum = esChg > 0 ? 9 : 1;
    else if (abs > 0.3) momentum = esChg > 0 ? 7 : 3;
    else if (abs > 0.1) momentum = esChg > 0 ? 6 : 4;
    else momentum = 5;
  }

  let orb = 5;
  if (totalMin >= 9 * 60 + 30 && totalMin < 10 * 60 + 30) {
    if (esChg !== null && esChg > 0.2) orb = 7;
    else if (esChg !== null && esChg < -0.2) orb = 3;
  }

  let vix = 5;
  if (nqChg !== null && esChg !== null) {
    const divergence = Math.abs(nqChg - esChg);
    if (divergence > 0.5) vix = 3;
    else if (divergence > 0.2) vix = 4;
    else vix = 6;
  }

  return { vwap: 5, emaTrend, rsi: 5, orb, volume: 5, vix, momentum, breadth: 5 };
}

function getBiasDirection(factors: BiasFactors): { direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; confidence: number; total: number } {
  const values = Object.values(factors);
  const total = values.reduce((a, b) => a + b, 0);
  const pct = (total / (values.length * 10)) * 100;
  const direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = pct > 58 ? 'BULLISH' : pct < 42 ? 'BEARISH' : 'NEUTRAL';
  return { direction, confidence: Math.round(pct), total };
}

function getGrade(confidence: number): GradeLetter {
  if (confidence >= 85) return 'A+';
  if (confidence >= 75) return 'A';
  if (confidence >= 60) return 'B';
  if (confidence >= 45) return 'C';
  if (confidence >= 35) return 'D';
  return 'F';
}

function getSubScores(factors: BiasFactors) {
  return {
    setup:     Math.round(((factors.orb + factors.vwap + factors.rsi) / 3 / 10) * 100),
    execution: Math.round(((factors.volume + factors.breadth) / 2 / 10) * 100),
    volatility: Math.round((factors.vix / 10) * 100),
    trend:     Math.round(((factors.emaTrend + factors.momentum) / 2 / 10) * 100),
  };
}

const GRADE_BEHAVIOR: Record<GradeLetter, { text: string; bg: string; textColor: string }> = {
  'A+': { text: 'High probability environment. Size up. Trend continuation favored.',          bg: 'bg-emerald-500/10 border border-emerald-500/30', textColor: 'text-emerald-400' },
  'A':  { text: 'Strong setup. Standard size. Wait for entry confirmation.',                   bg: 'bg-emerald-500/10 border border-emerald-500/30', textColor: 'text-emerald-400' },
  'B':  { text: 'Moderate conditions. Reduce size. Require additional confirmation.',          bg: 'bg-amber-500/10 border border-amber-500/30',     textColor: 'text-amber-400' },
  'C':  { text: 'Low quality environment. Cut frequency significantly.',                       bg: 'bg-amber-500/10 border border-amber-500/30',     textColor: 'text-amber-400' },
  'D':  { text: 'Capital preservation mode. Do not trade.',                                    bg: 'bg-red-500/10 border border-red-500/30',         textColor: 'text-red-400' },
  'F':  { text: 'Capital preservation mode. Do not trade.',                                    bg: 'bg-red-500/10 border border-red-500/30',         textColor: 'text-red-400' },
};

const GRADE_COLOR: Record<GradeLetter, string> = {
  'A+': 'text-emerald-400', 'A': 'text-emerald-400',
  'B':  'text-amber-400',   'C': 'text-amber-400',
  'D':  'text-red-400',     'F': 'text-red-400',
};

const SESSION_WINDOW_INFO: Record<SessionWindow, { badge: string; badgeColor: string }> = {
  Premarket:    { badge: 'Preparation Mode',    badgeColor: 'bg-amber-500/10 text-amber-400 border border-amber-500/30' },
  Open:         { badge: 'Execution Mode',      badgeColor: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' },
  Midday:       { badge: 'Low Priority Window', badgeColor: 'bg-gray-500/10 text-gray-400 border border-gray-500/30' },
  'Power Hour': { badge: 'Execution Mode',      badgeColor: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' },
  Other:        { badge: 'Review Mode',         badgeColor: 'bg-gray-500/10 text-gray-400 border border-gray-500/30' },
};

const BIAS_LABELS: Record<keyof BiasFactors, string> = {
  vwap: 'VWAP Position', emaTrend: 'EMA Trend', rsi: 'RSI Reading',
  orb: 'ORB Status', volume: 'Volume vs Avg', vix: 'VIX Level',
  momentum: 'Momentum', breadth: 'Market Breadth',
};

const UNAVAILABLE_FACTORS = new Set<keyof BiasFactors>(['vwap', 'rsi', 'volume', 'breadth']);

function barColor(val: number) {
  if (val < 4) return 'bg-red-500';
  if (val <= 6) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function scoreTextColor(val: number) {
  if (val < 4) return 'text-red-400';
  if (val <= 6) return 'text-amber-400';
  return 'text-emerald-400';
}

function regimeBorderClass(color: 'green' | 'amber' | 'red') {
  if (color === 'green') return 'border-emerald-500/20';
  if (color === 'amber') return 'border-amber-500/20';
  return 'border-red-500/20';
}

function regimeLabelColor(color: 'green' | 'amber' | 'red') {
  if (color === 'green') return 'text-emerald-400';
  if (color === 'amber') return 'text-amber-400';
  return 'text-red-400';
}

function actionBadgeClass(color: 'green' | 'amber' | 'red') {
  if (color === 'green') return 'bg-emerald-500 text-black';
  if (color === 'amber') return 'bg-amber-500 text-black';
  return 'bg-red-500 text-white';
}

function sessionBadgeClass(session: Session) {
  if (session === 'Asia') return 'bg-blue-500/10 border-blue-500/30 text-blue-400';
  if (session === 'London') return 'bg-purple-500/10 border-purple-500/30 text-purple-400';
  if (session === 'NY') return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
  return 'bg-gray-500/10 border-gray-500/30 text-gray-400';
}

function rangeStateBadgeClass(state: RangeState) {
  if (state === 'Expanded') return 'bg-red-500/10 border-red-500/30 text-red-400';
  if (state === 'Compressed') return 'bg-amber-500/10 border-amber-500/30 text-amber-400';
  return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
}

export default function MiniFuturesPage() {
  const [data, setData] = useState<FinvizResult<FinvizFuture> | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<Date>(new Date());
  const [tf, setTf] = useState<Timeframe>('5m');
  const [focusMode, setFocusMode] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [dismissedVix, setDismissedVix] = useState(false);
  const [dismissedClicks, setDismissedClicks] = useState(false);
  const [lastCheckTime] = useState<Date>(new Date());

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch('/api/finviz/futures');
        const json = await res.json();
        setData(json);
      } catch {
        setData({ data: [], sourceError: 'Fetch failed', lastUpdated: new Date().toISOString() });
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

  useEffect(() => {
    try {
      if (sessionStorage.getItem('tradevi-dismiss-clicks') === 'true') setDismissedClicks(true);
      if (sessionStorage.getItem('tradevi-dismiss-vix') === 'true') setDismissedVix(true);
    } catch {}
  }, []);

  const handleDismissClicks = useCallback(() => {
    setDismissedClicks(true);
    try { sessionStorage.setItem('tradevi-dismiss-clicks', 'true'); } catch {}
  }, []);

  const handleDismissVix = useCallback(() => {
    setDismissedVix(true);
    try { sessionStorage.setItem('tradevi-dismiss-vix', 'true'); } catch {}
  }, []);

  const handlePageClick = useCallback(() => setClickCount((c) => c + 1), []);

  const futures = data?.data ?? [];
  const es = futures.find((f) => f.symbol === 'ES');
  const esChange = es?.changePercent ?? null;

  const etDate = getETDate();
  const session = getSession(etDate);
  const sessionWindow = getSessionWindow(etDate);
  const rangeState = getRangeState(esChange);
  const regime = getRegime(esChange);
  const regimeInfo = REGIME_INFO[regime];
  const strategy = STRATEGY_INFO[regime] ?? { name: 'Scalp Only', rationale: 'Limited visibility. Reduce size, quick in/out only.' };
  const { label: nextLabel, secsRemaining } = getNextSessionTime(etDate);
  const factors = computeBias(futures, etDate);
  const biasResult = getBiasDirection(factors);
  const grade = getGrade(biasResult.confidence);
  const subScores = getSubScores(factors);
  const gradeBehavior = GRADE_BEHAVIOR[grade];
  const windowInfo = SESSION_WINDOW_INFO[sessionWindow];

  const etTimeStr = now.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });

  const showVixWarning = !dismissedVix && factors.vix < 4;
  const showClickWarning = !dismissedClicks && clickCount >= 3;
  const tfButtons: Timeframe[] = ['1m', '5m', '10m', '15m', '30m'];

  return (
    <div className="min-h-screen bg-[#0f0f0f]" onClick={handlePageClick}>
      <div className="max-w-4xl mx-auto px-4 pb-32 space-y-4">

        <div className="sticky top-0 z-10 bg-[#0f0f0f] border-b border-[#1e1e1e] py-3 -mx-4 px-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-mono font-semibold px-3 py-1 rounded-full border ${sessionBadgeClass(session)}`}>
                {session} Session
              </span>
              <span className={`text-xs font-mono px-2 py-0.5 rounded border ${windowInfo.badgeColor}`}>
                {windowInfo.badge}
              </span>
              <span className="text-xs text-gray-600 font-mono hidden sm:inline">
                Next: <span className="text-gray-400">{nextLabel}</span> in{' '}
                <span className="text-white font-semibold">{fmtCountdown(secsRemaining)}</span>
              </span>
              <span className={`text-xs font-mono px-2 py-0.5 rounded border ${rangeStateBadgeClass(rangeState)}`}>
                {rangeState}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-gray-500">{etTimeStr} ET</span>
              <button
                onClick={(e) => { e.stopPropagation(); setFocusMode((v) => !v); }}
                className={`text-xs px-3 py-1.5 rounded-lg border font-mono transition-all ${focusMode ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-400 hover:text-white'}`}
              >
                {focusMode ? 'Full View' : 'Focus Mode'}
              </button>
            </div>
          </div>
        </div>

        <div className="pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            {tfButtons.map((t) => (
              <button
                key={t}
                onClick={(e) => { e.stopPropagation(); setTf(t); }}
                className={`px-4 py-1.5 rounded-lg text-sm font-mono font-semibold border transition-all ${tf === t ? 'ring-2 ring-emerald-500/50 bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-[#111111] border-[#1e1e1e] text-gray-500 hover:text-gray-300'}`}
              >
                {t}
              </button>
            ))}
            <span className="text-xs text-gray-600 font-mono ml-1">Bias shown for {tf} timeframe</span>
          </div>
        </div>

        <div className={`bg-[#111111] border rounded-2xl p-6 min-h-[180px] ${regimeBorderClass(regimeInfo.color)}`}>
          <div className="flex items-start justify-between flex-wrap gap-6">
            <div>
              <div className="text-xs text-gray-600 uppercase tracking-widest mb-3 font-mono">Market Regime</div>
              <div className={`text-4xl font-bold font-mono mb-4 ${regimeLabelColor(regimeInfo.color)}`}>{regime}</div>
              <span className={`text-xs font-bold px-3 py-1.5 rounded-full font-mono ${actionBadgeClass(regimeInfo.color)}`}>
                {regimeInfo.action}
              </span>
            </div>
            <div className="flex flex-col gap-4 max-w-xs">
              <div>
                <div className="text-xs text-gray-600 uppercase tracking-wider mb-1 font-mono">Approach</div>
                <div className="text-gray-300 text-sm leading-relaxed">{regimeInfo.approach}</div>
              </div>
              <div>
                <div className="text-xs text-gray-600 uppercase tracking-wider mb-1 font-mono">Avoid</div>
                <div className="text-gray-500 text-sm leading-relaxed">{regimeInfo.avoid}</div>
              </div>
            </div>
          </div>
          {data && (
            <div className="mt-5">
              <SourceTag source={data.source ?? 'Finviz'} lastUpdated={data.lastUpdated} />
            </div>
          )}
        </div>

        {!focusMode && (
          <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs text-gray-600 uppercase tracking-widest font-mono">Bias Engine — {tf}</div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-bold font-mono ${biasResult.direction === 'BULLISH' ? 'text-emerald-400' : biasResult.direction === 'BEARISH' ? 'text-red-400' : 'text-amber-400'}`}>
                  {biasResult.direction}
                </span>
                <span className="text-xs text-gray-500 font-mono">{biasResult.confidence}% confidence</span>
                <span className="text-xs text-gray-700 font-mono">{biasResult.total}/80</span>
              </div>
            </div>
            <div className="space-y-3">
              {(Object.entries(factors) as [keyof BiasFactors, number][]).map(([key, val]) => {
                const unavail = UNAVAILABLE_FACTORS.has(key);
                return (
                  <div key={key} className="flex items-center gap-3">
                    <div className="text-xs text-gray-500 font-mono w-32 shrink-0">{BIAS_LABELS[key]}</div>
                    <div className="flex-1 h-1.5 bg-[#1e1e1e] rounded-full overflow-hidden">
                      {!unavail && (
                        <div
                          className={`h-full rounded-full transition-all ${barColor(val)}`}
                          style={{ width: `${(val / 10) * 100}%` }}
                        />
                      )}
                    </div>
                    <div className={`text-xs font-mono w-5 text-right ${unavail ? 'text-gray-700' : scoreTextColor(val)}`}>
                      {unavail ? '—' : val}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!focusMode && (
          <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5">
            <div className="text-xs text-gray-600 uppercase tracking-widest font-mono mb-4">Trade Quality Grade</div>
            <div className="flex items-center gap-6 flex-wrap">
              <div className={`text-8xl font-bold font-mono leading-none ${GRADE_COLOR[grade]}`}>{grade}</div>
              <div className="grid grid-cols-2 gap-3 flex-1 min-w-[240px]">
                {[
                  { label: 'Setup Probability', val: subScores.setup },
                  { label: 'Execution Quality', val: subScores.execution },
                  { label: 'Volatility Quality', val: subScores.volatility },
                  { label: 'Trend Alignment',   val: subScores.trend },
                ].map(({ label, val }) => (
                  <div key={label} className="bg-[#0f0f0f] rounded-xl p-3">
                    <div className="text-xs text-gray-600 font-mono mb-1">{label}</div>
                    <div className={`text-xl font-bold font-mono ${val >= 60 ? 'text-emerald-400' : val >= 45 ? 'text-amber-400' : 'text-red-400'}`}>{val}</div>
                    <div className="text-xs text-gray-700 font-mono">/100</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className={`rounded-2xl p-5 ${gradeBehavior.bg}`}>
          <div className="text-xs text-gray-500 uppercase tracking-widest font-mono mb-2">Suggested Behavior</div>
          <div className={`text-lg font-bold leading-snug ${gradeBehavior.textColor}`}>{gradeBehavior.text}</div>
        </div>

        <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5">
          <div className="text-xs text-gray-600 uppercase tracking-widest font-mono mb-3">Best Strategy</div>
          <div className="flex items-start gap-4 flex-wrap">
            <span className={`text-sm font-bold font-mono px-3 py-1.5 rounded-lg border shrink-0 ${strategy.name === 'NO TRADE' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
              {strategy.name}
            </span>
            <p className="text-gray-400 text-sm leading-relaxed pt-0.5">{strategy.rationale}</p>
          </div>
        </div>

        {!focusMode && (
          <div className="space-y-2">
            {showVixWarning && (
              <div className="flex items-center justify-between bg-red-500/10 border border-red-500/30 rounded-2xl px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="text-red-400 font-bold font-mono text-sm">!</span>
                  <span className="text-red-400 text-sm">VIX divergence detected — Widen stops or stand aside.</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDismissVix(); }}
                  className="text-red-600 hover:text-red-400 text-xs font-mono ml-4 shrink-0"
                >
                  ✕
                </button>
              </div>
            )}
            {showClickWarning && (
              <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-2xl px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="text-amber-400 font-bold font-mono text-sm">!</span>
                  <span className="text-amber-400 text-sm">High interaction frequency detected — Are you overtrading? Take a breath.</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDismissClicks(); }}
                  className="text-amber-600 hover:text-amber-400 text-xs font-mono ml-4 shrink-0"
                >
                  ✕
                </button>
              </div>
            )}
            {!showVixWarning && !showClickWarning && (
              <div className="flex items-center gap-2 px-5 py-3 bg-[#111111] border border-[#1e1e1e] rounded-2xl">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="text-xs text-gray-600 font-mono">
                  Protection layer active — last check{' '}
                  {lastCheckTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} ET
                </span>
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="text-gray-700 text-xs font-mono animate-pulse">Fetching market data...</div>
        )}
      </div>
    </div>
  );
}

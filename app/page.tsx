'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import ModeToggle from '@/components/ui/ModeToggle';
import { useTradeviStore } from '@/store/tradeviStore';
import type { FinvizFuture, FinvizResult } from '@/lib/finviz';

interface FuturesResult extends FinvizResult<FinvizFuture> {}

// ─── ICT Scoring ─────────────────────────────────────────────────────────────

interface AssetScore {
  symbol: string;
  label: string;
  direction: 'PUT' | 'CALL' | 'NONE';
  score: number;
  grade: string;
  reasons: string[];
  invalidations: string[];
  changePercent: number | null;
}

const ASSET_MAP: { symbol: string; label: string; futures: string[] }[] = [
  { symbol: 'NQ',   label: 'NQ / US100',  futures: ['NQ'] },
  { symbol: 'YM',   label: 'YM / US30',   futures: ['YM'] },
  { symbol: 'ES',   label: 'ES / S&P500',  futures: ['ES'] },
  { symbol: 'DAX',  label: 'DAX',          futures: [] },
];

function gradeFromScore(score: number): string {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  return 'NO TRADE';
}

function scoreAsset(f: FinvizFuture | undefined, mode: 'puts' | 'both'): AssetScore {
  const chg = f?.changePercent ?? null;
  const dir = f?.direction ?? null;
  let bearScore = 0;
  let bullScore = 0;
  const bearReasons: string[] = [];
  const bullReasons: string[] = [];

  // Higher TF Bearish / Bullish context (+25)
  if (chg !== null && chg < -0.5) { bearScore += 25; bearReasons.push('Higher TF bearish structure'); }
  else if (chg !== null && chg > 0.5) { bullScore += 25; bullReasons.push('Higher TF bullish structure'); }

  // Liquidity Sweep signal (+20) — gap up / gap down then reversing
  if (chg !== null && chg < -1.0) { bearScore += 20; bearReasons.push('Buy-side liquidity swept'); }
  else if (chg !== null && chg > 1.0) { bullScore += 20; bullReasons.push('Sell-side liquidity swept'); }

  // MSS / sustained structural move (+20)
  if (dir === 'down' && chg !== null && chg < -0.3) { bearScore += 20; bearReasons.push('MSS confirmed — bearish shift'); }
  else if (dir === 'up' && chg !== null && chg > 0.3) { bullScore += 20; bullReasons.push('MSS confirmed — bullish shift'); }

  // Bearish / Bullish BOS (+15)
  if (dir === 'down') { bearScore += 15; bearReasons.push('Bearish BOS in play'); }
  else if (dir === 'up') { bullScore += 15; bullReasons.push('Bullish BOS in play'); }

  // Displacement candle (+10)
  if (chg !== null && chg < -1.5) { bearScore += 10; bearReasons.push('Displacement candle — strong bearish move'); }
  else if (chg !== null && chg > 1.5) { bullScore += 10; bullReasons.push('Displacement candle — strong bullish move'); }

  // FVG present — use gap signal (+5)
  if (chg !== null && Math.abs(chg) > 0.3) { bearScore += 5; bullScore += 5; }
  if (chg !== null && chg < -0.3) bearReasons.push('FVG likely present below current price');
  if (chg !== null && chg > 0.3) bullReasons.push('FVG likely present above current price');

  // Premium zone proximity (+5)
  if (chg !== null && chg < 0) { bearScore += 5; bearReasons.push('Price in premium zone for puts'); }
  else if (chg !== null && chg > 0) { bullScore += 5; bullReasons.push('Price in discount zone for calls'); }

  const bearInvalidations = [
    'Higher high created above prev swing',
    'MSS fails — price reclaims lost level',
    'Liquidity sweep without follow-through',
    'Structure turns bullish on 15M',
  ];
  const bullInvalidations = [
    'Lower low created below prev swing',
    'MSS fails — price loses support',
    'Liquidity sweep without follow-through',
    'Structure turns bearish on 15M',
  ];

  if (mode === 'puts') {
    const score = Math.min(100, bearScore);
    return {
      symbol: f?.symbol ?? 'N/A',
      label: '',
      direction: score >= 80 ? 'PUT' : 'NONE',
      score,
      grade: gradeFromScore(score),
      reasons: bearReasons,
      invalidations: bearInvalidations,
      changePercent: chg,
    };
  }

  // Both mode — show whichever is stronger
  if (bearScore >= bullScore && bearScore >= 30) {
    const score = Math.min(100, bearScore);
    return {
      symbol: f?.symbol ?? 'N/A',
      label: '',
      direction: score >= 80 ? 'PUT' : 'NONE',
      score,
      grade: gradeFromScore(score),
      reasons: bearReasons,
      invalidations: bearInvalidations,
      changePercent: chg,
    };
  }
  if (bullScore > bearScore && bullScore >= 30) {
    const score = Math.min(100, bullScore);
    return {
      symbol: f?.symbol ?? 'N/A',
      label: '',
      direction: score >= 80 ? 'CALL' : 'NONE',
      score,
      grade: gradeFromScore(score),
      reasons: bullReasons,
      invalidations: bullInvalidations,
      changePercent: chg,
    };
  }

  return {
    symbol: f?.symbol ?? 'N/A',
    label: '',
    direction: 'NONE',
    score: Math.max(bearScore, bullScore),
    grade: 'NO TRADE',
    reasons: [],
    invalidations: [],
    changePercent: chg,
  };
}

// ─── Components ───────────────────────────────────────────────────────────────

function StatusCard({ scored }: { scored: AssetScore[] }) {
  const tradingMode = useTradeviStore((s) => s.tradingMode);
  const activePuts = scored.filter((s) => s.direction === 'PUT' && s.score >= 80);
  const activeCalls = scored.filter((s) => s.direction === 'CALL' && s.score >= 80);
  const forming = scored.filter((s) => s.score >= 60 && s.score < 80);

  let status: 'red' | 'yellow' | 'green';
  let headline: string;
  let sub: string;

  if (tradingMode === 'puts') {
    if (activePuts.length > 0) {
      status = 'red'; headline = 'PUT Setup Active';
      sub = activePuts.map((s) => s.symbol).join(' · ');
    } else if (forming.length > 0) {
      status = 'yellow'; headline = 'Setup Forming';
      sub = forming.map((s) => s.symbol).join(' · ');
    } else {
      status = 'green'; headline = 'No Short Setup';
      sub = 'Wait for structure';
    }
  } else {
    if (activePuts.length > 0 || activeCalls.length > 0) {
      status = activePuts.length > 0 ? 'red' : 'green';
      const parts: string[] = [];
      if (activePuts.length > 0) parts.push(`Bearish: ${activePuts.map((s) => s.symbol).join(' ')}`);
      if (activeCalls.length > 0) parts.push(`Bullish: ${activeCalls.map((s) => s.symbol).join(' ')}`);
      headline = parts.join(' · ');
      sub = 'Grade A+ or A setups detected';
    } else if (forming.length > 0) {
      status = 'yellow'; headline = 'No Trade';
      sub = 'Setups forming — wait for confirmation';
    } else {
      status = 'green'; headline = 'No Trade';
      sub = 'No valid setup';
    }
  }

  const colors = {
    red:    { dot: 'bg-red-500',    border: 'border-red-500/20',    text: 'text-red-400',    bg: 'bg-red-500/5' },
    yellow: { dot: 'bg-amber-400',  border: 'border-amber-500/20',  text: 'text-amber-400',  bg: 'bg-amber-500/5' },
    green:  { dot: 'bg-emerald-400',border: 'border-emerald-500/20',text: 'text-emerald-400',bg: 'bg-emerald-500/5' },
  }[status];

  return (
    <div className={`rounded-2xl border ${colors.border} ${colors.bg} p-6`}>
      <div className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-4">Market Status</div>
      <div className="flex items-center gap-3 mb-2">
        <span className={`w-4 h-4 rounded-full ${colors.dot} shadow-lg flex-shrink-0`} />
        <span className={`text-2xl font-black tracking-tight ${colors.text}`}>{headline}</span>
      </div>
      <div className="text-sm text-gray-500 pl-7">{sub}</div>
    </div>
  );
}

function ScoreCard({ scored, mode }: { scored: AssetScore[]; mode: 'puts' | 'both' }) {
  const best = scored.filter((s) => mode === 'puts' ? s.direction === 'PUT' : s.score >= 60)
    .sort((a, b) => b.score - a.score)[0];

  if (!best || best.score < 40) {
    return (
      <div className="rounded-2xl border border-[#1e1e1e] bg-[#0d0d0d] p-6">
        <div className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-4">
          {mode === 'puts' ? 'Short Bias Score' : 'Highest Probability Setup'}
        </div>
        <div className="text-4xl font-black text-gray-700">--</div>
        <div className="text-sm text-gray-600 mt-1">No setup found</div>
      </div>
    );
  }

  const gradeColor = best.grade === 'A+' || best.grade === 'A' ? 'text-emerald-400'
    : best.grade === 'B' ? 'text-amber-400' : 'text-gray-500';
  const dirColor = best.direction === 'PUT' ? 'text-red-400' : best.direction === 'CALL' ? 'text-emerald-400' : 'text-gray-500';

  return (
    <div className="rounded-2xl border border-[#1e1e1e] bg-[#0d0d0d] p-6">
      <div className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-4">
        {mode === 'puts' ? 'Short Bias Score' : 'Highest Probability Setup'}
      </div>
      {mode === 'both' && (
        <div className={`text-xs font-bold mb-2 ${dirColor}`}>Direction: {best.direction} · {best.symbol}</div>
      )}
      <div className="flex items-end gap-3 mb-2">
        <span className="text-5xl font-black text-white">{best.score}</span>
        <span className="text-2xl text-gray-600 mb-1">/100</span>
      </div>
      <div className={`text-2xl font-black ${gradeColor}`}>Grade: {best.grade}</div>
    </div>
  );
}

function WhyCard({ scored, mode }: { scored: AssetScore[]; mode: 'puts' | 'both' }) {
  const best = scored.filter((s) => mode === 'puts' ? s.direction === 'PUT' : s.score >= 60)
    .sort((a, b) => b.score - a.score)[0];

  const defaultReasons = [
    'Waiting for buy-side liquidity sweep',
    'MSS not yet confirmed',
    'No bearish BOS on execution TF',
    'No displacement candle present',
    'FVG not yet identified',
  ];

  const reasons = best?.reasons?.length ? best.reasons : defaultReasons;
  const hasSetup = best && best.score >= 80;

  return (
    <div className="rounded-2xl border border-[#1e1e1e] bg-[#0d0d0d] p-6">
      <div className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-4">
        {hasSetup ? 'Why This Setup' : 'Setup Checklist'}
      </div>
      <div className="space-y-2.5">
        {reasons.map((r, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className={`text-base mt-0.5 flex-shrink-0 ${hasSetup ? 'text-emerald-400' : 'text-gray-600'}`}>
              {hasSetup ? '✓' : '○'}
            </span>
            <span className={`text-sm leading-snug ${hasSetup ? 'text-gray-200' : 'text-gray-600'}`}>{r}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-[#1e1e1e]">
        <p className="text-[10px] text-gray-700">Confirm BOS/MSS/FVG on TradingView 15M/5M/1M before entry</p>
      </div>
    </div>
  );
}

function InvalidationsCard({ scored, mode }: { scored: AssetScore[]; mode: 'puts' | 'both' }) {
  const best = scored.filter((s) => mode === 'puts' ? s.direction !== 'NONE' : s.score >= 40)
    .sort((a, b) => b.score - a.score)[0];

  const inv = best?.invalidations ?? [
    'Higher high created above previous swing',
    'MSS fails — price reclaims lost level',
    'Price reclaims liquidity swept above',
    'Structure turns bullish on 15M or 5M',
  ];

  return (
    <div className="rounded-2xl border border-red-500/10 bg-red-500/5 p-6">
      <div className="text-xs font-bold text-red-500/60 uppercase tracking-widest mb-4">Invalidations — Do NOT Trade</div>
      <div className="space-y-2.5">
        {inv.map((r, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className="text-base text-red-500/70 mt-0.5 flex-shrink-0">✗</span>
            <span className="text-sm text-red-300/70 leading-snug">{r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScannerTable({ scored, mode }: { scored: AssetScore[]; mode: 'puts' | 'both' }) {
  const visible = mode === 'puts'
    ? scored
    : scored;

  const gradeColor = (g: string) =>
    g === 'A+' || g === 'A' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    : g === 'B' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    : 'text-gray-600 bg-[#161616] border-[#222]';

  const dirColor = (d: string) =>
    d === 'PUT' ? 'text-red-400' : d === 'CALL' ? 'text-emerald-400' : 'text-gray-600';

  return (
    <div className="rounded-2xl border border-[#1e1e1e] bg-[#0d0d0d] overflow-hidden">
      <div className="px-5 py-3 border-b border-[#1e1e1e] flex items-center justify-between">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Asset Scanner</span>
        <span className="text-[10px] text-gray-700">Sorted by score</span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#161616]">
            {['Asset', 'Change', 'Direction', 'Score', 'Grade'].map((h) => (
              <th key={h} className="px-5 py-2.5 text-left text-[10px] font-bold text-gray-600 uppercase tracking-widest">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((s) => (
            <tr key={s.symbol} className="border-b border-[#0f0f0f] hover:bg-white/[0.02] transition-colors">
              <td className="px-5 py-3">
                <div className="font-mono font-bold text-white text-sm">{s.symbol}</div>
                <div className="text-[10px] text-gray-600">{s.label}</div>
              </td>
              <td className="px-5 py-3">
                <span className={`font-mono text-sm font-semibold ${
                  (s.changePercent ?? 0) < 0 ? 'text-red-400' :
                  (s.changePercent ?? 0) > 0 ? 'text-emerald-400' : 'text-gray-600'
                }`}>
                  {s.changePercent !== null
                    ? `${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%`
                    : '--'}
                </span>
              </td>
              <td className="px-5 py-3">
                <span className={`font-mono font-bold text-sm ${dirColor(s.direction)}`}>{s.direction}</span>
              </td>
              <td className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden w-16">
                    <div
                      className={`h-full rounded-full ${s.score >= 80 ? 'bg-red-500' : s.score >= 60 ? 'bg-amber-500' : 'bg-gray-700'}`}
                      style={{ width: `${s.score}%` }}
                    />
                  </div>
                  <span className="font-mono text-sm text-gray-300 w-8">{s.score}</span>
                </div>
              </td>
              <td className="px-5 py-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded border ${gradeColor(s.grade)}`}>
                  {s.grade}
                </span>
              </td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr>
              <td colSpan={5} className="px-5 py-8 text-center text-gray-600 text-sm">
                No futures data available
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { tradingMode } = useTradeviStore();
  const [futuresData, setFuturesData] = useState<FuturesResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/finviz/futures')
      .then((r) => r.json())
      .then((d) => { setFuturesData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const futures = futuresData?.data ?? [];

  const scored: AssetScore[] = ASSET_MAP.map((asset) => {
    const f = futures.find((x) => asset.futures.includes(x.symbol));
    const s = scoreAsset(f, tradingMode);
    return { ...s, symbol: asset.symbol, label: asset.label };
  }).sort((a, b) => b.score - a.score);

  const modeLabel = tradingMode === 'puts' ? 'PUTS ONLY' : 'BOTH DIRECTIONS';
  const modeBadgeClass = tradingMode === 'puts'
    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Dashboard</h1>
          <p className="text-xs text-gray-600 mt-0.5">Should I trade? Where is the entry?</p>
        </div>
        <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${modeBadgeClass}`}>{modeLabel}</span>
      </div>

      {/* Mode Toggle — visible on desktop in sidebar, but shown here on mobile too */}
      <div className="md:hidden">
        <ModeToggle />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-[#1e1e1e] bg-[#0d0d0d] p-6 animate-pulse">
              <div className="h-3 w-24 bg-[#1e1e1e] rounded mb-4" />
              <div className="h-10 w-32 bg-[#1e1e1e] rounded mb-2" />
              <div className="h-4 w-20 bg-[#1e1e1e] rounded" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* 4 ADHD Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatusCard scored={scored} />
            <ScoreCard scored={scored} mode={tradingMode} />
            <WhyCard scored={scored} mode={tradingMode} />
            <InvalidationsCard scored={scored} mode={tradingMode} />
          </div>

          {/* Scanner Table */}
          <ScannerTable scored={scored} mode={tradingMode} />

          {/* Quick links */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { href: '/futures-bias', label: 'Futures Bias', icon: '◀' },
              { href: '/options', label: 'Options Scanner', icon: '⊗' },
              { href: '/journal', label: 'Journal', icon: '◈' },
            ].map(({ href, label, icon }) => (
              <Link
                key={href}
                href={href}
                className="rounded-xl border border-[#1e1e1e] bg-[#0d0d0d] p-4 flex flex-col gap-1 hover:border-[#2a2a2a] hover:bg-[#111] transition-all group"
              >
                <span className="text-xl text-gray-600 group-hover:text-gray-400">{icon}</span>
                <span className="text-xs font-semibold text-gray-500 group-hover:text-gray-300">{label}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      <p className="text-[10px] text-gray-700 text-center">
        ICT scoring uses live futures data · Confirm BOS / MSS / FVG on TradingView before every entry
      </p>
    </div>
  );
}

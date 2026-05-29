'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Activity,
  Shield, Zap, Eye, Ban, ChevronDown, ChevronUp, Info,
} from 'lucide-react';

// ─── Types (mirror API) ───────────────────────────────────────────────────────

interface ScoreBreakdown {
  technicals: number;
  flow: number;
  momentum: number;
  macro: number;
  sector: number;
  futures: number;
  liquidity: number;
  riskReward: number;
  smartMoney: number;
  crowdSaturation: number;
}

interface DiscoveryContract {
  symbol: string;
  contractSymbol: string;
  type: 'call' | 'put';
  strike: number;
  expiration: string;
  dte: number;
  bid: number;
  ask: number;
  mid: number;
  lastPrice: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  delta: number | null;
  theta: number | null;
  spreadPercent: number;
  breakeven: number;
  entryPrice: number;
  target1: number;
  target2: number;
  stopLoss: number;
  rrRatio: number;
  aiScore: number;
  scoreBreakdown: ScoreBreakdown;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D';
  action: 'enter' | 'watch' | 'skip';
  reason: string;
  category: 'short-term' | 'long-term';
  underlyingPrice: number;
}

type MoverClassification = 'Momentum Buy' | 'Pullback Buy' | 'Breakout Watch' | 'Extended / Wait' | 'Avoid';

interface Mover {
  symbol: string;
  shortName: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  volumeRatio: number;
  relativeStrength: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  classification: MoverClassification;
  classificationReason: string;
  preferredEntry: string;
  stopLossNote: string;
  rrNote: string;
  vwapEstimate: number;
  distanceFromVwapPct: number;
  distanceFromVwapATR: number;
  atrEstimate: number;
  hasConflict: boolean;
  conflictNote: string;
}

interface MarketTruth {
  score: number;
  biasScore: number;
  confidence: number;
  label: 'Strongly Bullish' | 'Bullish' | 'Mixed' | 'Bearish' | 'Strongly Bearish';
  futuresBias: 'bullish' | 'bearish' | 'mixed';
  futuresConfirmed: boolean;
  vixLevel: number;
  vixWarning: boolean;
  spyChange: number;
  qqChange: number;
  esChange: number;
  nqChange: number;
  ymChange: number;
  rtyChange: number;
  dxyChange: number;
  tenYieldChange: number;
  oilChange: number;
  goldChange: number;
  warnings: string[];
  drivers: string[];
  risks: string[];
}

interface PolicyWatchlistItem {
  symbol: string;
  shortName: string;
  theme: string;
  themeLabel: string;
  price: number;
  change: number;
  changePercent: number;
  rationale: string;
  disclosure: string;
  dataAge: string;
}

interface AvoidSignal {
  symbol: string;
  reason: string;
  severity: 'warning' | 'critical';
}

interface TradeDiscoveryResponse {
  success: boolean;
  marketTruth: MarketTruth;
  topMovers: Mover[];
  unusualVolume: Mover[];
  shortTermContracts: DiscoveryContract[];
  longTermContracts: DiscoveryContract[];
  bestRR: DiscoveryContract[];
  avoidSignals: AvoidSignal[];
  policyWatchlist: PolicyWatchlistItem[];
  dataWarnings: string[];
  meta: {
    dataSource: string;
    fetchedAt: string;
    symbolsScanned: number;
    contractsScored: number;
    delayNote: string;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 2) {
  return n.toFixed(dec);
}

function fmtMoney(n: number) {
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function fmtK(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

function dateLabel(s: string) {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Market Truth Meter ───────────────────────────────────────────────────────

function MarketTruthMeter({ mt }: { mt: MarketTruth }) {
  const biasScore = mt.biasScore ?? 0;
  const confidence = mt.confidence ?? 50;

  const isBullish = biasScore >= 3;
  const isBearish = biasScore <= -3;

  const biasColor = isBullish ? 'text-green-700' : isBearish ? 'text-red-700' : 'text-yellow-700';
  const biasBg = isBullish ? 'bg-green-50 border-green-200' : isBearish ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200';
  const confBarColor = isBullish ? 'bg-green-500' : isBearish ? 'bg-red-500' : 'bg-yellow-400';

  const drivers: string[] = mt.drivers ?? [];
  const risks: string[] = mt.risks ?? [];

  return (
    <div className="space-y-4">
      {/* Bias label + confidence */}
      <div className={`rounded-xl border px-4 py-3 ${biasBg}`}>
        <div className="flex items-center justify-between mb-1">
          <p className={`text-base font-bold ${biasColor}`}>{mt.label}</p>
          <span className={`text-sm font-black ${biasColor}`}>{confidence}% Confidence</span>
        </div>
        <div className="h-2 bg-white/60 rounded-full overflow-hidden mt-2">
          <div className={`h-full rounded-full ${confBarColor}`} style={{ width: `${confidence}%` }} />
        </div>
        <p className="text-xs text-gray-500 mt-1.5">
          Bias score: {biasScore >= 0 ? '+' : ''}{biasScore} · Based on 4 futures + VIX, DXY, 10Y
        </p>
      </div>

      {/* Drivers & Risks */}
      {(drivers.length > 0 || risks.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {drivers.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Drivers</p>
              <div className="space-y-1">
                {drivers.map((d, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-green-700">
                    <span className="font-bold">✓</span> {d}
                  </div>
                ))}
              </div>
            </div>
          )}
          {risks.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Risks</p>
              <div className="space-y-1">
                {risks.map((r, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-amber-700">
                    <span>⚠</span> {r}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Futures grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'ES', value: fmtPct(mt.esChange), up: mt.esChange >= 0 },
          { label: 'NQ', value: fmtPct(mt.nqChange), up: mt.nqChange >= 0 },
          { label: 'YM', value: fmtPct(mt.ymChange ?? 0), up: (mt.ymChange ?? 0) >= 0 },
          { label: 'RTY', value: fmtPct(mt.rtyChange ?? 0), up: (mt.rtyChange ?? 0) >= 0 },
        ].map(({ label, value, up }) => (
          <div key={label} className="rounded-xl border border-gray-100 bg-white p-2 text-center">
            <p className="text-xs text-gray-400 mb-0.5">{label}</p>
            <p className={`text-xs font-bold ${up ? 'text-green-600' : 'text-red-600'}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Macro grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'VIX', value: mt.vixLevel.toFixed(1), warn: mt.vixWarning, invert: true, chg: 0 },
          { label: 'DXY', value: fmtPct(mt.dxyChange ?? 0), warn: (mt.dxyChange ?? 0) > 0.5, invert: true, chg: mt.dxyChange ?? 0 },
          { label: '10Y', value: fmtPct(mt.tenYieldChange ?? 0), warn: (mt.tenYieldChange ?? 0) > 0.5, invert: true, chg: mt.tenYieldChange ?? 0 },
          { label: 'SPY', value: fmtPct(mt.spyChange), warn: false, invert: false, chg: mt.spyChange },
        ].map(({ label, value, warn, invert, chg }) => {
          const color = warn ? 'text-orange-600' : invert
            ? (chg > 0.3 ? 'text-orange-500' : 'text-green-600')
            : (chg >= 0 ? 'text-green-600' : 'text-red-600');
          return (
            <div key={label} className={`rounded-xl border p-2 text-center ${warn ? 'border-orange-200 bg-orange-50' : 'border-gray-100 bg-white'}`}>
              <p className="text-xs text-gray-400 mb-0.5">{label}</p>
              <p className={`text-xs font-bold ${color}`}>{value}</p>
            </div>
          );
        })}
      </div>

      {/* Futures confirmation chip */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500">Futures Bias:</span>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${mt.futuresBias === 'bullish' ? 'bg-green-100 text-green-700 border-green-200' : mt.futuresBias === 'bearish' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-yellow-100 text-yellow-700 border-yellow-200'}`}>
          {mt.futuresBias === 'bullish' ? '▲ Bullish' : mt.futuresBias === 'bearish' ? '▼ Bearish' : '⟺ Mixed'}
        </span>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${mt.futuresConfirmed ? 'bg-green-100 text-green-700 border-green-200' : 'bg-yellow-100 text-yellow-700 border-yellow-200'}`}>
          {mt.futuresConfirmed ? 'CONFIRMED ✓' : 'NOT CONFIRMED ⚠'}
        </span>
      </div>

      {/* Warnings */}
      {mt.warnings.length > 0 && (
        <div className="space-y-1.5">
          {mt.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
              <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">{w}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Contract Table ───────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-green-500' : score >= 55 ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-bold ${score >= 70 ? 'text-green-700' : score >= 55 ? 'text-yellow-700' : 'text-red-600'}`}>{score}</span>
    </div>
  );
}

function GradeChip({ grade }: { grade: string }) {
  const style = grade === 'A+' ? 'bg-green-100 text-green-800 border-green-200' :
    grade === 'A' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
    grade === 'B' ? 'bg-blue-100 text-blue-800 border-blue-200' :
    grade === 'C' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
    'bg-gray-100 text-gray-500 border-gray-200';
  return <span className={`inline-block text-xs font-bold px-1.5 py-0.5 rounded border ${style}`}>{grade}</span>;
}

function ActionChip({ action }: { action: string }) {
  const style = action === 'enter' ? 'bg-green-600 text-white' :
    action === 'watch' ? 'bg-blue-100 text-blue-800' :
    'bg-gray-100 text-gray-500';
  return <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${style}`}>{action.toUpperCase()}</span>;
}

function ScoreTooltip({ breakdown }: { breakdown: ScoreBreakdown }) {
  const factors = [
    { label: 'Technicals', val: breakdown.technicals, max: 15 },
    { label: 'Flow', val: breakdown.flow, max: 15 },
    { label: 'Momentum', val: breakdown.momentum, max: 10 },
    { label: 'Macro', val: breakdown.macro, max: 15 },
    { label: 'Sector', val: breakdown.sector, max: 10 },
    { label: 'Futures', val: breakdown.futures, max: 10 },
    { label: 'Liquidity', val: breakdown.liquidity, max: 10 },
    { label: 'R:R', val: breakdown.riskReward, max: 10 },
    { label: 'Smart $', val: breakdown.smartMoney, max: 8 },
    { label: 'Saturation', val: breakdown.crowdSaturation, max: 7 },
  ];
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 p-2">
      {factors.map(f => (
        <div key={f.label} className="flex items-center justify-between gap-2 text-xs">
          <span className="text-gray-500">{f.label}</span>
          <span className="font-semibold text-gray-800">{f.val}/{f.max}</span>
        </div>
      ))}
    </div>
  );
}

function ContractRow({ c, expanded, onToggle }: { c: DiscoveryContract; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-b border-gray-50 hover:bg-gray-50 transition cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-3">
          <div className="font-semibold text-gray-900 text-sm">{c.symbol}</div>
          <div className={`text-xs font-medium ${c.type === 'call' ? 'text-green-600' : 'text-red-600'}`}>{c.type.toUpperCase()}</div>
        </td>
        <td className="px-3 py-3">
          <div className="text-sm font-medium text-gray-800">${c.strike}</div>
        </td>
        <td className="px-3 py-3">
          <div className="text-sm text-gray-700">{dateLabel(c.expiration)}</div>
          <div className="text-xs text-gray-400">{c.dte}d</div>
        </td>
        <td className="px-3 py-3">
          <div className="text-sm text-gray-800">{fmtMoney(c.bid)} / {fmtMoney(c.ask)}</div>
          <div className="text-xs text-gray-400">Last: {fmtMoney(c.lastPrice)}</div>
        </td>
        <td className="px-3 py-3">
          <div className="text-sm text-gray-700">{fmtK(c.volume)}</div>
        </td>
        <td className="px-3 py-3">
          <div className="text-sm text-gray-700">{fmtK(c.openInterest)}</div>
        </td>
        <td className="px-3 py-3">
          <div className="text-sm">{(c.impliedVolatility * 100).toFixed(0)}%</div>
          <div className="text-xs text-gray-400">Δ {c.delta != null ? c.delta.toFixed(2) : '--'}</div>
        </td>
        <td className="px-3 py-3">
          <ScoreBar score={c.aiScore} />
        </td>
        <td className="px-3 py-3">
          <GradeChip grade={c.grade} />
        </td>
        <td className="px-3 py-3">
          <ActionChip action={c.action} />
        </td>
        <td className="px-3 py-3">
          {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50 border-b border-gray-100">
          <td colSpan={11} className="px-4 py-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {/* Trade levels */}
              <div>
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Trade Levels</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Entry</span>
                    <span className="font-medium text-gray-800">{fmtMoney(c.entryPrice)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">T1 (+100%)</span>
                    <span className="font-medium text-green-700">{fmtMoney(c.target1)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">T2 (+175%)</span>
                    <span className="font-medium text-green-600">{fmtMoney(c.target2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Stop (−50%)</span>
                    <span className="font-medium text-red-600">{fmtMoney(c.stopLoss)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">R:R</span>
                    <span className={`font-bold ${c.rrRatio >= 2.0 ? 'text-green-700' : c.rrRatio >= 1.5 ? 'text-yellow-700' : 'text-red-600'}`}>{fmt(c.rrRatio, 1)}:1</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Breakeven</span>
                    <span className="font-medium text-gray-700">{fmtMoney(c.breakeven)}</span>
                  </div>
                </div>
              </div>

              {/* Greeks */}
              <div>
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Greeks</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Delta</span>
                    <span className="font-medium text-gray-800">{c.delta != null ? c.delta.toFixed(3) : '--'}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Theta/day</span>
                    <span className="font-medium text-red-600">{c.theta != null ? c.theta.toFixed(4) : '--'}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">IV</span>
                    <span className="font-medium text-gray-800">{(c.impliedVolatility * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Spread</span>
                    <span className={`font-medium ${c.spreadPercent > 15 ? 'text-red-600' : c.spreadPercent > 8 ? 'text-yellow-600' : 'text-gray-700'}`}>{fmt(c.spreadPercent, 1)}%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Spot Price</span>
                    <span className="font-medium text-gray-800">{fmtMoney(c.underlyingPrice)}</span>
                  </div>
                </div>
              </div>

              {/* AI Score breakdown */}
              <div className="col-span-2">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">AI Score Breakdown</p>
                <ScoreTooltip breakdown={c.scoreBreakdown} />
                <p className="text-xs text-gray-400 mt-2 italic">{c.reason}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ContractsTable({ contracts, title }: { contracts: DiscoveryContract[]; title: string }) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  if (contracts.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400">
        <p className="text-sm">No contracts found for the current market conditions.</p>
        <p className="text-xs mt-1">Try refreshing during market hours.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-6 px-6">
      <table className="w-full min-w-[900px] text-left">
        <thead>
          <tr className="border-b border-gray-100">
            {['Symbol/Type', 'Strike', 'Expiry', 'Bid/Ask', 'Vol', 'OI', 'IV/Δ', 'AI Score', 'Grade', 'Action', ''].map(h => (
              <th key={h} className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contracts.map((c) => (
            <ContractRow
              key={c.contractSymbol || `${c.symbol}-${c.strike}-${c.type}-${c.expiration}`}
              c={c}
              expanded={expandedRow === c.contractSymbol}
              onToggle={() => setExpandedRow((prev: string | null) => prev === c.contractSymbol ? null : c.contractSymbol)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Mover Card ───────────────────────────────────────────────────────────────

const CLASSIFICATION_STYLES: Record<MoverClassification, { label: string; color: string; bg: string; border: string }> = {
  'Momentum Buy':    { label: 'Momentum Buy',    color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200'  },
  'Pullback Buy':    { label: 'Pullback Buy',     color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  'Breakout Watch':  { label: 'Breakout Watch',   color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200'   },
  'Extended / Wait': { label: 'Extended / Wait',  color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200'  },
  'Avoid':           { label: 'Avoid',            color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200'    },
};

function MoverCard({ m, contracts }: { m: Mover; contracts?: DiscoveryContract[] }) {
  const [open, setOpen] = useState(false);
  const up = m.changePercent >= 0;
  const cls = m.classification ?? 'Breakout Watch';
  const style = CLASSIFICATION_STYLES[cls];
  const topContracts = contracts?.slice(0, 3) ?? [];

  return (
    <div className={`bg-white rounded-2xl shadow-sm overflow-hidden border ${style.border}`}>
      {/* Header */}
      <div
        className={`px-4 pt-3 pb-2 ${style.bg} cursor-pointer`}
        onClick={() => setOpen((v: boolean) => !v)}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-bold text-gray-900">{m.symbol}</p>
            <p className="text-xs text-gray-500 truncate max-w-[110px]">{m.shortName}</p>
          </div>
          <span className={`text-sm font-bold ${up ? 'text-green-600' : 'text-red-600'}`}>{fmtPct(m.changePercent)}</span>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <p className="text-base font-semibold text-gray-800">{fmtMoney(m.price)}</p>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${style.bg} ${style.border} ${style.color}`}>
            {style.label}
          </span>
        </div>
      </div>

      {/* Mixed signal / conflict warning */}
      {m.hasConflict && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border-t border-amber-200">
          <AlertTriangle size={11} className="text-amber-500 shrink-0" />
          <p className="text-xs text-amber-700 font-medium">{m.conflictNote}</p>
        </div>
      )}

      {/* Summary row */}
      <div className="flex justify-between text-xs text-gray-400 px-4 py-2 border-t border-gray-100">
        <span>Vol: {fmtK(m.volume)}</span>
        <span className={m.volumeRatio >= 2 ? 'text-orange-600 font-semibold' : ''}>{m.volumeRatio.toFixed(1)}x avg</span>
        {Math.abs(m.relativeStrength) >= 0.3 && (
          <span className={m.relativeStrength > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
            RS {fmtPct(m.relativeStrength)}
          </span>
        )}
      </div>

      {/* Top options contracts */}
      {topContracts.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Top Options</p>
          <div className="space-y-1.5">
            {topContracts.map(c => (
              <div key={c.contractSymbol} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-bold ${c.type === 'call' ? 'text-green-600' : 'text-red-600'}`}>
                    {c.type === 'call' ? 'C' : 'P'}
                  </span>
                  <span className="text-xs text-gray-700 font-medium">${c.strike} · {dateLabel(c.expiration)}</span>
                  <span className="text-xs text-gray-400">{c.dte}d</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-gray-600">{fmtMoney(c.ask)}</span>
                  <GradeChip grade={c.grade} />
                  <span className="text-xs font-semibold text-blue-700">{fmt(c.rrRatio, 1)}:1</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {topContracts.length === 0 && cls !== 'Avoid' && (
        <div className="px-4 py-2 border-t border-gray-100">
          <p className="text-xs text-gray-400 italic">No qualifying options found</p>
        </div>
      )}

      {/* Expanded detail */}
      {open && (
        <div className="px-4 pb-3 border-t border-gray-100 space-y-2 text-xs">
          <p className="text-gray-500 italic pt-1">{m.classificationReason}</p>

          {cls !== 'Avoid' && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div className="flex justify-between">
                <span className="text-gray-400">Entry Zone</span>
                <span className="font-medium text-gray-700">{m.preferredEntry}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Stop Loss</span>
                <span className="font-medium text-red-600">{m.stopLossNote}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">R:R</span>
                <span className={`font-bold ${m.rrNote !== 'N/A' ? 'text-green-700' : 'text-gray-400'}`}>{m.rrNote}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">VWAP Est.</span>
                <span className="font-medium text-gray-700">{fmtMoney(m.vwapEstimate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Dist. VWAP</span>
                <span className={`font-medium ${Math.abs(m.distanceFromVwapPct) > 3 ? 'text-amber-600' : 'text-gray-600'}`}>
                  {m.distanceFromVwapPct >= 0 ? '+' : ''}{m.distanceFromVwapPct.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">VWAP ATR dist.</span>
                <span className={`font-medium ${Math.abs(m.distanceFromVwapATR) > 2 ? 'text-red-600' : 'text-gray-600'}`}>
                  {m.distanceFromVwapATR >= 0 ? '+' : ''}{m.distanceFromVwapATR.toFixed(1)} ATR
                </span>
              </div>
            </div>
          )}

          {/* 52w context */}
          <div className="flex justify-between pt-1 border-t border-gray-100 text-gray-400">
            <span>52w L: {fmtMoney(m.fiftyTwoWeekLow)}</span>
            <span>52w H: {fmtMoney(m.fiftyTwoWeekHigh)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Policy Watchlist ─────────────────────────────────────────────────────────

function PolicyRow({ item, expanded, onToggle }: { item: PolicyWatchlistItem; expanded: boolean; onToggle: () => void }) {
  const up = item.changePercent >= 0;
  return (
    <>
      <tr className="border-b border-gray-50 hover:bg-gray-50 transition cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-3">
          <div className="font-bold text-sm text-gray-900">{item.symbol}</div>
          <div className="text-xs text-gray-500">{item.shortName}</div>
        </td>
        <td className="px-4 py-3">
          <Badge variant="purple" size="sm">{item.themeLabel}</Badge>
        </td>
        <td className="px-4 py-3 text-sm text-gray-800">{fmtMoney(item.price)}</td>
        <td className="px-4 py-3">
          <span className={`text-sm font-semibold ${up ? 'text-green-600' : 'text-red-600'}`}>{fmtPct(item.changePercent)}</span>
        </td>
        <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">{item.rationale}</td>
        <td className="px-4 py-3">
          {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50 border-b border-gray-100">
          <td colSpan={6} className="px-4 py-3">
            <div className="flex items-start gap-2 mb-2">
              <Info size={13} className="text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-gray-700">{item.rationale}</p>
            </div>
            <div className="flex items-start gap-2 mb-1">
              <Shield size={13} className="text-gray-400 mt-0.5 shrink-0" />
              <p className="text-xs text-gray-500 italic">{item.disclosure}</p>
            </div>
            <p className="text-xs text-gray-400 mt-1">{item.dataAge}</p>
          </td>
        </tr>
      )}
    </>
  );
}

function PolicyWatchlist({ items }: { items: PolicyWatchlistItem[] }) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  if (items.length === 0) {
    return <div className="text-center py-8 text-gray-400 text-sm">Watchlist data unavailable.</div>;
  }

  // Group by theme
  const themes = Array.from(new Set(items.map(i => i.theme)));

  return (
    <div>
      <div className="flex items-start gap-2 mb-4 rounded-xl bg-blue-50 border border-blue-200 p-3">
        <Shield size={14} className="text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-700">
          <strong>Public data only.</strong> This watchlist is based solely on publicly available market data, public government contract awards, SEC filings, Congressional disclosures, and verified news reporting. It does not contain or suggest nonpublic information of any kind.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {themes.map(t => {
          const sample = items.find(i => i.theme === t);
          return (
            <span key={t} className="text-xs px-2 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-100">
              {sample?.themeLabel ?? t}
            </span>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[600px]">
          <thead>
            <tr className="border-b border-gray-100">
              {['Symbol', 'Theme', 'Price', 'Change', 'Rationale (Public)', ''].map(h => (
                <th key={h} className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <PolicyRow
                key={item.symbol}
                item={item}
                expanded={expandedRow === item.symbol}
                onToggle={() => setExpandedRow((prev: string | null) => prev === item.symbol ? null : item.symbol)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-4 italic">
        Price data delayed ~15-20 min (Yahoo Finance). Not financial advice. Always verify through official sources before trading.
      </p>
    </div>
  );
}

// ─── Best R:R Section ─────────────────────────────────────────────────────────

function BestRRCard({ c }: { c: DiscoveryContract }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`bg-white border rounded-2xl overflow-hidden shadow-sm transition ${c.grade === 'A+' ? 'border-green-200' : 'border-gray-100'}`}>
      <div
        className={`px-4 py-3 flex items-start justify-between cursor-pointer ${c.grade === 'A+' ? 'bg-green-50' : 'bg-gray-50'}`}
        onClick={() => setOpen((v: boolean) => !v)}
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900">{c.symbol}</span>
            <span className={`text-xs font-semibold ${c.type === 'call' ? 'text-green-700' : 'text-red-700'}`}>{c.type.toUpperCase()}</span>
            <GradeChip grade={c.grade} />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">${c.strike} exp {dateLabel(c.expiration)} ({c.dte}d)</p>
        </div>
        <div className="text-right">
          <p className={`text-lg font-bold ${c.rrRatio >= 2.5 ? 'text-green-700' : 'text-yellow-700'}`}>{fmt(c.rrRatio, 1)}:1 R:R</p>
          <p className="text-xs text-gray-400">AI Score: {c.aiScore}</p>
        </div>
      </div>
      {open && (
        <div className="px-4 py-3 border-t border-gray-100 grid grid-cols-2 gap-x-6 gap-y-1.5">
          {[
            ['Entry', fmtMoney(c.entryPrice)],
            ['Breakeven', fmtMoney(c.breakeven)],
            ['T1 (+100%)', fmtMoney(c.target1)],
            ['T2 (+175%)', fmtMoney(c.target2)],
            ['Stop (−50%)', fmtMoney(c.stopLoss)],
            ['Spread', `${c.spreadPercent.toFixed(1)}%`],
            ['IV', `${(c.impliedVolatility * 100).toFixed(0)}%`],
            ['Vol/OI', `${fmtK(c.volume)} / ${fmtK(c.openInterest)}`],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between text-xs">
              <span className="text-gray-500">{label}</span>
              <span className="font-medium text-gray-800">{value}</span>
            </div>
          ))}
          <div className="col-span-2 mt-1">
            <p className="text-xs text-gray-400 italic">{c.reason}</p>
          </div>
          <div className="col-span-2">
            <ActionChip action={c.action} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TradeDiscoveryPage() {
  const [data, setData] = useState<TradeDiscoveryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [contractTab, setContractTab] = useState<'short' | 'long'>('short');
  const [policyOpen, setPolicyOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/trade-discovery');
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? `Request failed (${res.status})`);
      }
      const json: TradeDiscoveryResponse = await res.json();
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load trade discovery data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const contractsToShow = useMemo(() => {
    if (!data) return [];
    return contractTab === 'short' ? data.shortTermContracts : data.longTermContracts;
  }, [data, contractTab]);

  return (
    <AppShell title="Trade Discovery">
      <div className="space-y-6">

        {/* Header */}
        <Card className="p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-gray-900">Trade Discovery Engine</span>
                <Badge variant="purple">AI Powered</Badge>
                <Badge variant="warning">15-20 Min Delayed</Badge>
              </div>
              <p className="text-sm text-gray-500 max-w-2xl">
                Scans 40+ symbols across futures, sectors, mega-cap, and policy themes. Scores options using 10 AI factors. Not financial advice.
              </p>
              {data && (
                <p className="text-xs text-gray-400 mt-1">
                  {data.meta.symbolsScanned} symbols scanned · {data.meta.contractsScored} contracts evaluated · Updated {new Date(data.meta.fetchedAt).toLocaleTimeString()}
                </p>
              )}
            </div>
            <Button onClick={load} loading={loading} size="sm">
              <RefreshCw size={14} className="mr-2" />
              {loading ? 'Scanning…' : 'Refresh Scan'}
            </Button>
          </div>
        </Card>

        {/* Error */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-start gap-2">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-700">Scan failed</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Data warnings */}
        {data?.dataWarnings && data.dataWarnings.length > 0 && (
          <div className="space-y-2">
            {data.dataWarnings
              .filter(w => w.toLowerCase().includes('unavailable') || w.toLowerCase().includes('do not trade'))
              .map((w, i) => (
                <div key={i} className="rounded-2xl border border-red-300 bg-red-50 p-4 flex items-start gap-2">
                  <AlertTriangle size={15} className="text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm font-semibold text-red-700">{w}</p>
                </div>
              ))}
          </div>
        )}

        {loading && !data && (
          <div className="text-center py-20">
            <div className="inline-flex flex-col items-center gap-3">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
              <p className="text-sm text-gray-500">Scanning markets and scoring contracts…</p>
              <p className="text-xs text-gray-400">This takes 10-20 seconds</p>
            </div>
          </div>
        )}

        {data && (
          <>
            {/* Market Truth Meter + Movers */}
            <div className="grid gap-6 xl:grid-cols-3">
              <Card className="p-6 xl:col-span-1">
                <div className="flex items-center gap-2 mb-4">
                  <Activity size={16} className="text-purple-500" />
                  <h2 className="text-sm font-semibold text-gray-900">Market Truth Meter</h2>
                </div>
                <MarketTruthMeter mt={data.marketTruth} />
              </Card>

              <Card className="p-6 xl:col-span-2">
                <div className="flex items-center gap-2 mb-4">
                  <Zap size={16} className="text-orange-500" />
                  <h2 className="text-sm font-semibold text-gray-900">Top Movers</h2>
                  <span className="text-xs text-gray-400 ml-1">Today's biggest price moves</span>
                </div>
                {data.topMovers.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
                    {data.topMovers.slice(0, 8).map(m => {
                      const moverContracts = [...(data.shortTermContracts ?? []), ...(data.longTermContracts ?? [])]
                        .filter(c => c.symbol === m.symbol)
                        .sort((a, b) => b.aiScore - a.aiScore)
                        .slice(0, 3);
                      return <MoverCard key={m.symbol} m={m} contracts={moverContracts} />;
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-8">No significant movers detected. Market may be closed or data delayed.</p>
                )}
              </Card>
            </div>

            {/* Unusual Volume */}
            {data.unusualVolume.length > 0 && (
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={16} className="text-blue-500" />
                  <h2 className="text-sm font-semibold text-gray-900">Unusual Volume</h2>
                  <span className="text-xs text-gray-400 ml-1">Volume 2x+ above 3-month average</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {data.unusualVolume.slice(0, 10).map(m => {
                    const moverContracts = [...(data.shortTermContracts ?? []), ...(data.longTermContracts ?? [])]
                      .filter(c => c.symbol === m.symbol)
                      .sort((a, b) => b.aiScore - a.aiScore)
                      .slice(0, 3);
                    return <MoverCard key={m.symbol} m={m} contracts={moverContracts} />;
                  })}
                </div>
              </Card>
            )}

            {/* Top Contracts (Short/Long-term tabs) */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Eye size={16} className="text-purple-500" />
                <h2 className="text-sm font-semibold text-gray-900">Top 50 Contracts Engine</h2>
                <span className="text-xs text-gray-400 ml-1">AI-scored, ranked by multi-factor signal</span>
              </div>

              {/* Tabs */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setContractTab('short')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold border transition ${contractTab === 'short' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'}`}
                >
                  Short-Term (0–14 DTE)
                  {data.shortTermContracts.length > 0 && (
                    <span className="ml-1.5 bg-purple-400 text-white text-xs rounded-full px-1.5 py-0.5">
                      {data.shortTermContracts.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setContractTab('long')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold border transition ${contractTab === 'long' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'}`}
                >
                  Long-Term (30+ DTE / LEAPS)
                  {data.longTermContracts.length > 0 && (
                    <span className="ml-1.5 bg-purple-400 text-white text-xs rounded-full px-1.5 py-0.5">
                      {data.longTermContracts.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-3 mb-4">
                {[
                  { label: 'A+ Grade', color: 'bg-green-100 text-green-800', desc: 'Score ≥75, R:R ≥2:1, liquid' },
                  { label: 'A Grade', color: 'bg-emerald-100 text-emerald-800', desc: 'Score ≥60, R:R ≥1.5:1' },
                  { label: 'ENTER', color: 'bg-green-600 text-white', desc: 'Strong conviction signal' },
                  { label: 'WATCH', color: 'bg-blue-100 text-blue-800', desc: 'Monitor for entry' },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-1.5">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${item.color}`}>{item.label}</span>
                    <span className="text-xs text-gray-400">{item.desc}</span>
                  </div>
                ))}
              </div>

              <ContractsTable
                contracts={contractsToShow}
                title={contractTab === 'short' ? 'Short-Term' : 'Long-Term'}
              />
            </Card>

            {/* Best R:R */}
            {data.bestRR.length > 0 && (
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={16} className="text-green-500" />
                  <h2 className="text-sm font-semibold text-gray-900">Best Risk-to-Reward</h2>
                  <span className="text-xs text-gray-400 ml-1">Grade A or A+ contracts with R:R ≥ 2:1 minimum</span>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  All entries use Stop = −50% of entry, Target 1 = +100% (2:1 R:R), Target 2 = +175% (3.5:1 R:R). Click any card to expand trade levels.
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {data.bestRR.map(c => (
                    <BestRRCard key={c.contractSymbol || `${c.symbol}-${c.strike}-${c.type}`} c={c} />
                  ))}
                </div>
              </Card>
            )}

            {/* Avoid These */}
            {data.avoidSignals.length > 0 && (
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Ban size={16} className="text-red-500" />
                  <h2 className="text-sm font-semibold text-gray-900">Avoid These Trades</h2>
                  <span className="text-xs text-gray-400 ml-1">Current market conditions + structure warnings</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.avoidSignals.map((s, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 rounded-xl p-3 border ${s.severity === 'critical' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}
                    >
                      <AlertTriangle size={14} className={`mt-0.5 shrink-0 ${s.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`} />
                      <div>
                        <p className={`text-xs font-bold ${s.severity === 'critical' ? 'text-red-700' : 'text-amber-700'}`}>{s.symbol}</p>
                        <p className={`text-xs mt-0.5 ${s.severity === 'critical' ? 'text-red-600' : 'text-amber-600'}`}>{s.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Policy / Public Disclosure Watchlist */}
            <Card className="p-6">
              <button
                type="button"
                className="w-full flex items-center justify-between"
                onClick={() => setPolicyOpen((v: boolean) => !v)}
              >
                <div className="flex items-center gap-2">
                  <Shield size={16} className="text-purple-500" />
                  <h2 className="text-sm font-semibold text-gray-900">Public Policy Watchlist</h2>
                  <Badge variant="purple">Public Data Only</Badge>
                  <span className="text-xs text-gray-400">Based on public disclosures, filings, and verified reports</span>
                </div>
                {policyOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
              </button>

              {policyOpen && (
                <div className="mt-4">
                  <PolicyWatchlist items={data.policyWatchlist} />
                </div>
              )}
            </Card>

            {/* Footer disclaimer */}
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs text-gray-400 text-center leading-relaxed">
                <strong className="text-gray-500">Not financial advice.</strong> All data is from Yahoo Finance (~15-20 min delayed).
                Trade signals are algorithmic and educational only. Past patterns do not guarantee future results.
                Always do your own research. Never risk more than you can afford to lose.
                {' '}Policy watchlist uses only publicly available market data, public government contracts, SEC filings, and verified reporting.
                No nonpublic information is used or implied.
              </p>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

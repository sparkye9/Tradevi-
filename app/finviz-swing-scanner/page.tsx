'use client';

import { useState, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import {
  Zap, RefreshCw, AlertTriangle, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Minus, Target, Activity,
  BarChart2, Eye, Shield, Clock,
} from 'lucide-react';
import type { ScannerResponse, InstitutionalSetup } from '@/app/api/finviz-swing-scanner/route';

// ─── Inline UI primitives ─────────────────────────────────────────────────────

function TrendDot({ bias }: { bias: 'bullish' | 'bearish' | 'neutral' }) {
  const cls = bias === 'bullish'
    ? 'bg-emerald-400 shadow-emerald-400/50 shadow-sm'
    : bias === 'bearish'
    ? 'bg-red-400 shadow-red-400/50 shadow-sm'
    : 'bg-gray-500';
  return <span className={`inline-block w-2 h-2 rounded-full ${cls}`} />;
}

function TrendIcon({ bias }: { bias: 'bullish' | 'bearish' | 'neutral' }) {
  if (bias === 'bullish') return <TrendingUp size={12} className="text-emerald-400" />;
  if (bias === 'bearish') return <TrendingDown size={12} className="text-red-400" />;
  return <Minus size={12} className="text-gray-500" />;
}

function ScoreBar({ score, max = 10, color }: { score: number; max?: number; color: string }) {
  const pct = Math.min(100, (score / max) * 100);
  return (
    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 8) return 'bg-emerald-400';
  if (score >= 6) return 'bg-yellow-400';
  if (score >= 4) return 'bg-orange-400';
  return 'bg-red-400';
}

function scoreTextColor(score: number): string {
  if (score >= 8) return 'text-emerald-400';
  if (score >= 6) return 'text-yellow-400';
  if (score >= 4) return 'text-orange-400';
  return 'text-red-400';
}

function BiasChip({ bias }: { bias: 'bullish' | 'bearish' | 'neutral' }) {
  const cls = bias === 'bullish'
    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    : bias === 'bearish'
    ? 'bg-red-500/20 text-red-400 border-red-500/30'
    : 'bg-gray-700/50 text-gray-400 border-gray-600';
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${cls} uppercase tracking-wide`}>
      {bias}
    </span>
  );
}

function MetricCell({ label, value, highlight }: { label: string; value: string | number; highlight?: string }) {
  return (
    <div>
      <p className="text-gray-500 text-xs mb-0.5">{label}</p>
      <p className={`font-semibold text-sm ${highlight ?? 'text-gray-200'}`}>{value}</p>
    </div>
  );
}

function KeltnerBadge({ pos }: { pos: InstitutionalSetup['keltnerPosition'] }) {
  const map: Record<InstitutionalSetup['keltnerPosition'], { label: string; cls: string }> = {
    above_upper: { label: 'Above Upper', cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
    near_upper:  { label: 'Near Upper',  cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    middle:      { label: 'Midline',     cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    near_lower:  { label: 'Near Lower',  cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    below_lower: { label: 'Below Lower', cls: 'bg-red-600/20 text-red-500 border-red-600/30' },
  };
  const { label, cls } = map[pos];
  return <span className={`text-xs px-2 py-0.5 rounded border font-medium ${cls}`}>{label}</span>;
}

function RiskBadge({ level }: { level: InstitutionalSetup['riskLevel'] }) {
  const cls = level === 'low' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    : level === 'medium' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    : 'bg-red-500/20 text-red-400 border-red-500/30';
  return <span className={`text-xs px-2 py-0.5 rounded border font-semibold uppercase ${cls}`}>{level} risk</span>;
}

// ─── Top-3 setup card ──────────────────────────────────────────────────────────

function TopSetupCard({ setup, mode }: { setup: InstitutionalSetup; mode: 'calls' | 'puts' }) {
  const isCalls = mode === 'calls';
  const accent = isCalls ? 'border-emerald-500/40' : 'border-red-500/40';
  const rankBg = isCalls ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30';
  const primaryScore = isCalls ? setup.bullishScore : setup.bearishScore;
  const scoreLabel   = isCalls ? 'Bull Score' : 'Bear Score';

  const tfRows: { label: string; key: keyof InstitutionalSetup['trendAlignment'] }[] = [
    { label: 'Monthly', key: 'monthly' },
    { label: 'Weekly',  key: 'weekly'  },
    { label: 'Daily',   key: 'daily'   },
    { label: '4H',      key: 'h4'      },
    { label: '1H',      key: 'h1'      },
  ];

  return (
    <div className={`bg-gray-900 border ${accent} border-l-2 rounded-xl p-5 flex flex-col gap-4`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-1 rounded border ${rankBg}`}>
            #{setup.rank}
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-bold text-white">{setup.symbol}</span>
              <BiasChip bias={setup.bias} />
            </div>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[180px]">{setup.company}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-white">${setup.price.toFixed(2)}</p>
          <p className={`text-xs font-semibold ${setup.changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {setup.changePct >= 0 ? '+' : ''}{setup.changePct.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Primary score */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-gray-400">{scoreLabel}</span>
          <span className={`text-lg font-bold ${scoreTextColor(primaryScore)}`}>{primaryScore.toFixed(1)}/10</span>
        </div>
        <ScoreBar score={primaryScore} color={scoreColor(primaryScore)} />
      </div>

      {/* Confidence */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">Confidence</span>
        <div className="flex items-center gap-2">
          <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(100, setup.confidence)}%` }} />
          </div>
          <span className="text-purple-400 font-semibold">{setup.confidence}%</span>
        </div>
      </div>

      {/* Trend alignment */}
      <div className="space-y-1">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Trend Alignment</p>
        {tfRows.map(({ label, key }) => {
          const tf = setup.trendAlignment[key];
          return (
            <div key={key} className="flex items-center justify-between">
              <span className="text-xs text-gray-500 w-14">{label}</span>
              <div className="flex items-center gap-1.5">
                <TrendDot bias={tf.bias} />
                <span className={`text-xs ${tf.bias === 'bullish' ? 'text-emerald-400' : tf.bias === 'bearish' ? 'text-red-400' : 'text-gray-500'}`}>
                  {tf.bias}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Key levels */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-800/50 rounded-lg p-2">
          <p className="text-gray-500 mb-0.5">Support</p>
          <p className="text-emerald-400 font-semibold">${setup.support.toFixed(2)}</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-2">
          <p className="text-gray-500 mb-0.5">Resistance</p>
          <p className="text-red-400 font-semibold">${setup.resistance.toFixed(2)}</p>
        </div>
      </div>

      {/* Keltner */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">Keltner</span>
        <KeltnerBadge pos={setup.keltnerPosition} />
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="text-center">
          <p className="text-gray-500">RSI</p>
          <p className={`font-bold ${setup.rsi > 70 ? 'text-red-400' : setup.rsi > 55 ? 'text-emerald-400' : 'text-gray-300'}`}>{setup.rsi.toFixed(1)}</p>
        </div>
        <div className="text-center">
          <p className="text-gray-500">ATR</p>
          <p className="font-bold text-gray-300">${setup.atr.toFixed(2)}</p>
        </div>
        <div className="text-center">
          <p className="text-gray-500">RelVol</p>
          <p className={`font-bold ${setup.relVolume > 1.5 ? 'text-emerald-400' : setup.relVolume > 1 ? 'text-yellow-400' : 'text-gray-400'}`}>{setup.relVolume.toFixed(1)}x</p>
        </div>
      </div>

      {/* Options plan */}
      <div className="bg-gray-800/60 border border-gray-700/50 rounded-lg p-3 text-xs space-y-1.5">
        <p className="text-gray-400 font-medium uppercase tracking-wide mb-2">Options Plan</p>
        <div className="flex justify-between">
          <span className="text-gray-500">Contract</span>
          <span className={`font-semibold ${setup.bestContractType === 'calls' ? 'text-emerald-400' : 'text-red-400'}`}>
            {setup.bestContractType.toUpperCase()}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Strike Delta</span>
          <span className="text-gray-300 font-medium">{setup.suggestedDelta}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">DTE</span>
          <span className="text-gray-300 font-medium">{setup.suggestedDTE}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Expected Move</span>
          <span className="text-purple-400 font-semibold">{setup.expectedMovePotential}</span>
        </div>
      </div>

      {/* Entry / Stop / Target */}
      <div className="text-xs space-y-1.5">
        <p className="text-gray-500 font-medium uppercase tracking-wide">Trade Plan</p>
        <div className="flex justify-between">
          <span className="text-gray-500">Entry</span>
          <span className="text-gray-300 font-medium text-right max-w-[180px]">{setup.idealEntry}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Stop</span>
          <span className="text-red-400 font-semibold">${setup.idealStop.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Target 1</span>
          <span className="text-emerald-400 font-semibold">${setup.idealTarget.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">R:R</span>
          <span className="text-purple-400 font-bold">{setup.riskReward}</span>
        </div>
      </div>

      {/* Risk */}
      <div className="flex justify-end">
        <RiskBadge level={setup.riskLevel} />
      </div>
    </div>
  );
}

// ─── Expanded card content ─────────────────────────────────────────────────────

function ExpandedContent({ setup }: { setup: InstitutionalSetup }) {
  const tfRows: { label: string; key: keyof InstitutionalSetup['trendAlignment'] }[] = [
    { label: 'Monthly', key: 'monthly' },
    { label: 'Weekly',  key: 'weekly'  },
    { label: 'Daily',   key: 'daily'   },
    { label: '4H',      key: 'h4'      },
    { label: '1H',      key: 'h1'      },
  ];

  return (
    <div className="mt-4 space-y-5 border-t border-gray-800 pt-4">
      {/* Trend alignment */}
      <div>
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2 flex items-center gap-1">
          <Activity size={11} /> Trend Alignment
        </p>
        <div className="space-y-2">
          {tfRows.map(({ label, key }) => {
            const tf = setup.trendAlignment[key];
            return (
              <div key={key} className="flex items-start gap-3">
                <div className="flex items-center gap-1.5 w-16 flex-shrink-0 mt-0.5">
                  <TrendDot bias={tf.bias} />
                  <span className="text-xs text-gray-400">{label}</span>
                </div>
                <p className="text-xs text-gray-300">{tf.desc || tf.bias}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* BOS / CHoCH */}
      {(setup.recentBOS.length > 0 || setup.recentCHoCH.length > 0) && (
        <div>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2 flex items-center gap-1">
            <TrendingUp size={11} /> Structure Events
          </p>
          <div className="space-y-1.5">
            {setup.recentBOS.map((b, i) => (
              <div key={`bos-${i}`} className="flex items-center gap-2 text-xs">
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-medium">BOS</span>
                <span className="text-gray-300">{b}</span>
              </div>
            ))}
            {setup.recentCHoCH.map((c, i) => (
              <div key={`choch-${i}`} className="flex items-center gap-2 text-xs">
                <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 text-xs font-medium">CHoCH</span>
                <span className="text-gray-300">{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FVG Levels */}
      {setup.fvgLevels.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2 flex items-center gap-1">
            <BarChart2 size={11} /> Fair Value Gaps
          </p>
          <div className="space-y-1.5">
            {setup.fvgLevels.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-xs bg-gray-800/40 rounded px-2 py-1">
                <span className={f.type === 'bullish' ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>
                  {f.type === 'bullish' ? '↑' : '↓'} {f.type}
                </span>
                <span className="text-gray-400">${f.low.toFixed(2)} – ${f.high.toFixed(2)}</span>
                <span className="text-gray-500">mid ${f.mid.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analysis texts */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="bg-gray-800/40 rounded-lg p-3">
          <p className="text-xs text-gray-500 font-medium mb-1.5 uppercase tracking-wide">Keltner Analysis</p>
          <p className="text-xs text-gray-300 leading-relaxed">{setup.keltnerAnalysis}</p>
        </div>
        <div className="bg-gray-800/40 rounded-lg p-3">
          <p className="text-xs text-gray-500 font-medium mb-1.5 uppercase tracking-wide">Volume Analysis</p>
          <p className="text-xs text-gray-300 leading-relaxed">{setup.volumeAnalysis}</p>
        </div>
        <div className="bg-gray-800/40 rounded-lg p-3">
          <p className="text-xs text-gray-500 font-medium mb-1.5 uppercase tracking-wide">Momentum</p>
          <p className="text-xs text-gray-300 leading-relaxed">{setup.momentumAnalysis}</p>
        </div>
        <div className="bg-gray-800/40 rounded-lg p-3">
          <p className="text-xs text-gray-500 font-medium mb-1.5 uppercase tracking-wide">Structure</p>
          <p className="text-xs text-gray-300 leading-relaxed">{setup.structureAnalysis}</p>
        </div>
      </div>

      {/* Key levels */}
      <div>
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2 flex items-center gap-1">
          <Target size={11} /> Key Levels
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-xs">
          <div className="bg-gray-800/40 rounded-lg p-2 text-center">
            <p className="text-gray-500 mb-0.5">Support 1</p>
            <p className="text-emerald-400 font-semibold">${setup.support.toFixed(2)}</p>
          </div>
          <div className="bg-gray-800/40 rounded-lg p-2 text-center">
            <p className="text-gray-500 mb-0.5">Support 2</p>
            <p className="text-emerald-400/70 font-semibold">${setup.support2.toFixed(2)}</p>
          </div>
          <div className="bg-gray-800/40 rounded-lg p-2 text-center">
            <p className="text-gray-500 mb-0.5">Resistance</p>
            <p className="text-red-400 font-semibold">${setup.resistance.toFixed(2)}</p>
          </div>
          <div className="bg-gray-800/40 rounded-lg p-2 text-center">
            <p className="text-gray-500 mb-0.5">Resist 2</p>
            <p className="text-red-400/70 font-semibold">${setup.resistance2.toFixed(2)}</p>
          </div>
          <div className="bg-gray-800/40 rounded-lg p-2 text-center">
            <p className="text-gray-500 mb-0.5">Breakout</p>
            <p className="text-purple-400 font-semibold">${setup.breakoutLevel.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Liquidity zones */}
      {setup.liquidityZones.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2 flex items-center gap-1">
            <Eye size={11} /> Liquidity Zones
          </p>
          <div className="flex flex-wrap gap-2">
            {setup.liquidityZones.map((z, i) => (
              <span key={i} className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded px-2 py-0.5 font-medium">
                ${z.toFixed(2)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Trade plan */}
      <div>
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2 flex items-center gap-1">
          <Shield size={11} /> Ideal Trade Plan
        </p>
        <div className="grid sm:grid-cols-2 gap-3 text-xs">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">Entry Zone</span>
              <span className="text-gray-300 text-right max-w-[200px]">{setup.idealEntry}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Stop Loss</span>
              <span className="text-red-400 font-semibold">${setup.idealStop.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Target 1</span>
              <span className="text-emerald-400 font-semibold">${setup.idealTarget.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Target 2 (runner)</span>
              <span className="text-emerald-300 font-semibold">${setup.idealTarget2.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Risk/Reward</span>
              <span className="text-purple-400 font-bold">{setup.riskReward}</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">Contract Type</span>
              <span className={`font-semibold ${setup.bestContractType === 'calls' ? 'text-emerald-400' : 'text-red-400'}`}>
                {setup.bestContractType.toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Strike Delta</span>
              <span className="text-gray-300">{setup.suggestedDelta}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">DTE</span>
              <span className="text-gray-300">{setup.suggestedDTE}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Expected Move</span>
              <span className="text-purple-400 font-semibold">{setup.expectedMovePotential}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Risk Level</span>
              <RiskBadge level={setup.riskLevel} />
            </div>
          </div>
        </div>
      </div>

      {/* Scores */}
      <div>
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">All Scores</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-500">Bullish</span>
              <span className={`font-bold ${scoreTextColor(setup.bullishScore)}`}>{setup.bullishScore}/10</span>
            </div>
            <ScoreBar score={setup.bullishScore} color={scoreColor(setup.bullishScore)} />
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-500">Bearish</span>
              <span className={`font-bold ${scoreTextColor(setup.bearishScore)}`}>{setup.bearishScore}/10</span>
            </div>
            <ScoreBar score={setup.bearishScore} color={scoreColor(setup.bearishScore)} />
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-500">Continuation</span>
              <span className="font-bold text-blue-400">{setup.continuationProbability}%</span>
            </div>
            <ScoreBar score={setup.continuationProbability} max={100} color="bg-blue-400" />
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-500">R:R Quality</span>
              <span className={`font-bold ${scoreTextColor(setup.rrQuality)}`}>{setup.rrQuality}/10</span>
            </div>
            <ScoreBar score={setup.rrQuality} color={scoreColor(setup.rrQuality)} />
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-500">Trend Str.</span>
              <span className={`font-bold ${scoreTextColor(setup.trendStrength)}`}>{setup.trendStrength}/10</span>
            </div>
            <ScoreBar score={setup.trendStrength} color={scoreColor(setup.trendStrength)} />
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-500">Vol Quality</span>
              <span className={`font-bold ${scoreTextColor(setup.volatilityQuality)}`}>{setup.volatilityQuality}/10</span>
            </div>
            <ScoreBar score={setup.volatilityQuality} color={scoreColor(setup.volatilityQuality)} />
          </div>
          <div className="sm:col-span-2">
            <div className="flex justify-between mb-1">
              <span className="text-gray-500">Premium Expansion</span>
              <span className={`font-bold ${scoreTextColor(setup.premiumExpansionPotential)}`}>{setup.premiumExpansionPotential}/10</span>
            </div>
            <ScoreBar score={setup.premiumExpansionPotential} color={scoreColor(setup.premiumExpansionPotential)} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Collapsed/expanded row card ───────────────────────────────────────────────

function SetupCard({ setup }: { setup: InstitutionalSetup }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors">
      {/* Collapsed header — always visible */}
      <button
        className="w-full text-left px-5 py-4 flex items-center gap-3 focus:outline-none"
        onClick={() => setExpanded(v => !v)}
      >
        {/* Rank */}
        <span className="w-7 h-7 flex-shrink-0 bg-gray-800 border border-gray-700 rounded-lg flex items-center justify-center text-xs font-bold text-gray-300">
          {setup.rank}
        </span>

        {/* Symbol */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white text-base">{setup.symbol}</span>
            <span className="text-gray-500 text-xs truncate max-w-[160px] hidden sm:inline">{setup.company}</span>
            <BiasChip bias={setup.bias} />
          </div>
        </div>

        {/* Price + change */}
        <div className="text-right flex-shrink-0">
          <p className="font-bold text-white text-sm">${setup.price.toFixed(2)}</p>
          <p className={`text-xs font-semibold ${setup.changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {setup.changePct >= 0 ? '+' : ''}{setup.changePct.toFixed(2)}%
          </p>
        </div>

        {/* Scores */}
        <div className="flex-shrink-0 flex items-center gap-3 ml-2">
          <div className="text-center hidden sm:block">
            <p className="text-xs text-gray-500">Bull</p>
            <p className={`text-sm font-bold ${scoreTextColor(setup.bullishScore)}`}>{setup.bullishScore.toFixed(1)}</p>
          </div>
          <div className="text-center hidden sm:block">
            <p className="text-xs text-gray-500">Bear</p>
            <p className={`text-sm font-bold ${scoreTextColor(setup.bearishScore)}`}>{setup.bearishScore.toFixed(1)}</p>
          </div>
          <div className="text-center hidden md:block">
            <p className="text-xs text-gray-500">Cont%</p>
            <p className="text-sm font-bold text-blue-400">{setup.continuationProbability}%</p>
          </div>
        </div>

        {/* Trend icons */}
        <div className="flex-shrink-0 flex items-center gap-0.5 hidden lg:flex">
          {(['monthly', 'weekly', 'daily', 'h4', 'h1'] as const).map(tf => (
            <TrendIcon key={tf} bias={setup.trendAlignment[tf].bias} />
          ))}
        </div>

        {/* Expand chevron */}
        <span className="flex-shrink-0 text-gray-500 ml-1">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-5 pb-5">
          <ExpandedContent setup={setup} />
        </div>
      )}
    </div>
  );
}

// ─── Loading spinner ───────────────────────────────────────────────────────────

function LoadingState({ step }: { step: number }) {
  const steps = [
    'Fetching FINviz screener results...',
    'Analyzing multi-timeframe structure...',
    'Scoring institutional setups...',
  ];
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-6">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Zap size={20} className="text-purple-400" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-gray-300 font-medium text-sm">{steps[step % steps.length]}</p>
        <div className="flex justify-center gap-1 mt-3">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${i === step % steps.length ? 'bg-purple-500' : 'bg-gray-700'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Macro context bar ─────────────────────────────────────────────────────────

function MacroBar({ macro, stocksScanned, fetchedAt }: {
  macro: ScannerResponse['macroContext'];
  stocksScanned: number;
  fetchedAt: string;
}) {
  const vixColor = macro.vix > 20 ? 'text-red-400' : macro.vix > 15 ? 'text-amber-400' : 'text-emerald-400';
  const vixBg    = macro.vix > 20 ? 'bg-red-500/10 border-red-500/20' : macro.vix > 15 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-emerald-500/10 border-emerald-500/20';
  const riskCls  = macro.riskEnvironment === 'risk-on' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    : macro.riskEnvironment === 'risk-off' ? 'bg-red-500/20 text-red-400 border-red-500/30'
    : 'bg-gray-700/50 text-gray-400 border-gray-600';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 text-xs">
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border ${vixBg}`}>
        <span className="text-gray-500">VIX</span>
        <span className={`font-bold text-sm ${vixColor}`}>{macro.vix.toFixed(1)}</span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-gray-500">SPY</span>
        <span className={`font-semibold ${macro.spyChangePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {macro.spyChangePct >= 0 ? '+' : ''}{macro.spyChangePct.toFixed(2)}%
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-gray-500">QQQ</span>
        <span className={`font-semibold ${macro.qqqChangePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {macro.qqqChangePct >= 0 ? '+' : ''}{macro.qqqChangePct.toFixed(2)}%
        </span>
      </div>

      <span className={`px-2 py-0.5 rounded border font-semibold uppercase tracking-wide ${riskCls}`}>
        {macro.riskEnvironment}
      </span>

      <div className="flex items-center gap-1">
        <BiasChip bias={macro.trend} />
        <span className="text-gray-500">market trend</span>
      </div>

      <div className="ml-auto flex items-center gap-3 text-gray-500">
        <span className="flex items-center gap-1">
          <BarChart2 size={11} />
          Scanned {stocksScanned} stocks
        </span>
        <span className="flex items-center gap-1">
          <Clock size={11} />
          {new Date(fetchedAt).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinvizSwingScannerPage() {
  const [data, setData]         = useState<ScannerResponse | null>(null);
  const [loading, setLoading]   = useState(false);
  const [loadStep, setLoadStep] = useState(0);
  const [error, setError]       = useState<string | null>(null);

  const runScan = useCallback(async (bust = false) => {
    setLoading(true);
    setError(null);
    setLoadStep(0);

    // Animate loading steps
    const stepInterval = setInterval(() => {
      setLoadStep(s => (s + 1) % 3);
    }, 1400);

    try {
      const url = `/api/finviz-swing-scanner${bust ? '?bust=1' : ''}`;
      const res = await fetch(url, { cache: 'no-store' });
      const json: ScannerResponse = await res.json();
      if (!json.success && json.error) {
        setError(json.error);
      } else {
        setData(json);
      }
    } catch (err) {
      setError('Network error — could not reach the scanner API.');
    } finally {
      clearInterval(stepInterval);
      setLoading(false);
    }
  }, []);

  return (
    <AppShell title="Institutional FINviz Swing Scanner">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center">
            <Zap size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Institutional FINviz Swing Scanner</h1>
            <p className="text-sm text-gray-500">FINviz screener → multi-timeframe analysis → ranked swing setups</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 inline-block">
          Universe: NASDAQ + NYSE, $10–$80, avg vol &gt;1M, rel vol &gt;1.5, above SMA20/50/200, week up, optionable
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-xl mb-5 text-sm text-red-800">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-red-600" />
          <div>
            <p className="font-semibold">Scan failed</p>
            <p className="text-red-700 text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && <LoadingState step={loadStep} />}

      {/* Initial CTA — no data yet */}
      {!loading && !data && !error && (
        <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
          <div className="w-20 h-20 bg-purple-600/10 border border-purple-500/20 rounded-2xl flex items-center justify-center">
            <Zap size={36} className="text-purple-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Ready to Scan</h2>
            <p className="text-gray-500 text-sm max-w-md">
              Click below to fetch live FINviz screener results and run full institutional analysis on each setup.
            </p>
          </div>
          <button
            onClick={() => runScan()}
            className="px-8 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg shadow-purple-500/20 text-base"
          >
            Run Institutional Scan
          </button>
          <p className="text-xs text-gray-400 max-w-sm leading-relaxed">
            Analyzes live FINviz screener results · Multi-timeframe structure · BOS/CHoCH/FVG · Keltner Channel · Institutional scoring
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && data && (
        <div className="space-y-6">
          {/* Macro bar + rescan */}
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <MacroBar macro={data.macroContext} stocksScanned={data.stocksScanned} fetchedAt={data.fetchedAt} />
            </div>
            <button
              onClick={() => runScan(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 transition-colors flex-shrink-0 mt-0.5"
            >
              <RefreshCw size={12} />
              Rescan
            </button>
          </div>

          {/* ── TOP 3 CALLS ── */}
          {data.top3Calls.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-emerald-500/20 border border-emerald-500/30 rounded-lg flex items-center justify-center">
                    <TrendingUp size={16} className="text-emerald-400" />
                  </div>
                  <h2 className="text-base font-bold text-gray-900">TOP 3 CALL SWING SETUPS</h2>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full uppercase tracking-wide">
                  Institutional Grade
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {data.top3Calls.map(s => (
                  <TopSetupCard key={`call-${s.symbol}`} setup={s} mode="calls" />
                ))}
              </div>
            </section>
          )}

          {/* ── TOP 3 PUTS ── */}
          {data.top3Puts.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center justify-center">
                    <TrendingDown size={16} className="text-red-400" />
                  </div>
                  <h2 className="text-base font-bold text-gray-900">TOP 3 PUT SWING SETUPS</h2>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 bg-red-100 text-red-700 border border-red-200 rounded-full uppercase tracking-wide">
                  Bearish Signals
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {data.top3Puts.map(s => (
                  <TopSetupCard key={`put-${s.symbol}`} setup={s} mode="puts" />
                ))}
              </div>
            </section>
          )}

          {/* ── FULL RANKED LIST ── */}
          {data.allSetups.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-purple-500/20 border border-purple-500/30 rounded-lg flex items-center justify-center">
                  <BarChart2 size={16} className="text-purple-400" />
                </div>
                <h2 className="text-base font-bold text-gray-900">FULL RANKED ANALYSIS</h2>
                <span className="text-xs text-gray-500">{data.allSetups.length} setups · click to expand</span>
              </div>
              <div className="space-y-2">
                {data.allSetups.map(s => (
                  <SetupCard key={s.symbol} setup={s} />
                ))}
              </div>
            </section>
          )}

          {/* Disclaimer */}
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-xs text-amber-800">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5 text-amber-600" />
            <p>
              <strong>For educational and research purposes only.</strong> This scanner uses algorithmic analysis and does not guarantee profitable trades.
              Options trading involves significant risk and can result in total loss of premium. Always confirm your own analysis, size positions appropriately,
              and never risk more than you can afford to lose. Past screener results do not predict future performance.
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
}

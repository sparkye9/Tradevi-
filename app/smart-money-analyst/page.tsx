'use client';

import { useState, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/Card';
import {
  BrainCircuit, TrendingUp, TrendingDown, Minus, Search, RefreshCw,
  AlertTriangle, Target, Zap, Shield, Clock, BarChart2, Eye,
  ChevronRight, Activity, Globe,
} from 'lucide-react';
import { clsx } from 'clsx';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalysisResult {
  ticker: string;
  timestamp: string;
  quote: {
    price: number; change: number; changePercent: number;
    volume: number; volumeRatio: number; volumeLabel: string;
    open: number; high: number; low: number; prevClose: number;
    fiftyTwoWeekHigh: number; fiftyTwoWeekLow: number;
    shortName: string; gapPercent: number;
  };
  globalConditions: {
    vix: number; dxy: number; tnx: number; oil: number;
    esFuturesChange: number; nqFuturesChange: number;
    riskEnvironment: string; riskLabel: string; vixLabel: string;
    dxyStrength: string; yieldPressure: string; futuresNarrative: string;
  };
  indicators: { rsi: number | null; atr: number | null; ma20: number | null; ma50: number | null; trend: string; trendStrength: number };
  structure: {
    trend: string; intradayTrend: string; rsi: number | null; rsiLabel: string;
    from52High: number; from52Low: number; rangePosition: number; zone: string;
    keyLevels: { support1: number; support2: number; resistance1: number; resistance2: number; dayHigh: number; dayLow: number; vwapEstimate: number };
    mtf: { monthly: string; weekly: string; daily: string; h4: string; h1: string; m15: string };
  };
  psychology: {
    narrative: string;
    trappedTrader: { side: string; reason: string };
    fearGreedTone: string; fomoRisk: string; panicRisk: string; squeezeRisk: string; capitulationRisk: string;
  };
  openingScenarios: Record<string, number>;
  powerHour: { pump: number; dump: number; flat: number; narrative: string; squeezeRisk: string; profitTakingRisk: string };
  tradePlan: {
    bullish: { entryTrigger: string; confirmation: string; target1: number; target2: number; stopLoss: number; invalidation: string; riskReward: string };
    bearish: { entryTrigger: string; confirmation: string; target1: number; target2: number; stopLoss: number; invalidation: string; riskReward: string };
  };
  optionsSetup: { bestBullishArea: string; bestBearishArea: string; deltaRange: string; thetaRisk: string; ivRisk: string; saferExpiration: string; avoidance: string; spreadIdea: string };
  verdict: { bias: string; confidence: number; dailyDirection: string; weeklyDirection: string; strongestRisk: string; strongestBullish: string; strongestBearish: string; recommendation: string; cleanSetup: boolean; summary: string };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BiasIcon({ bias }: { bias: string }) {
  if (bias === 'bullish') return <TrendingUp size={18} className="text-green-600" />;
  if (bias === 'bearish') return <TrendingDown size={18} className="text-red-600" />;
  return <Minus size={18} className="text-gray-400" />;
}

function BiasChip({ bias, size = 'md' }: { bias: string; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'lg' ? 'px-4 py-2 text-sm font-bold' : size === 'sm' ? 'px-2 py-0.5 text-xs font-semibold' : 'px-3 py-1 text-sm font-semibold';
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 rounded-full',
      sz,
      bias === 'bullish' ? 'bg-green-100 text-green-700' :
      bias === 'bearish' ? 'bg-red-100 text-red-700' :
      'bg-gray-100 text-gray-600'
    )}>
      <BiasIcon bias={bias} />
      {bias.toUpperCase()}
    </span>
  );
}

function RiskChip({ level }: { level: string }) {
  return (
    <span className={clsx(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide',
      level === 'HIGH' ? 'bg-red-100 text-red-700' :
      level === 'MODERATE' ? 'bg-yellow-100 text-yellow-700' :
      'bg-green-100 text-green-700'
    )}>
      {level}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className={clsx('w-2.5 h-5 rounded-sm', i < value ? (value >= 7 ? 'bg-green-500' : value >= 5 ? 'bg-yellow-500' : 'bg-red-400') : 'bg-gray-100')} />
        ))}
      </div>
      <span className="text-sm font-bold text-gray-700">{value}/10</span>
    </div>
  );
}

function ProbabilityBar({ label, value, color = 'purple' }: { label: string; value: number; color?: string }) {
  const colorMap: Record<string, string> = {
    green: 'bg-green-500', red: 'bg-red-500', purple: 'bg-purple-500',
    blue: 'bg-blue-500', yellow: 'bg-yellow-500', orange: 'bg-orange-500',
  };
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-600 font-medium">{label}</span>
        <span className="text-xs font-bold text-gray-800">{value}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all duration-500', colorMap[color] ?? 'bg-purple-500')} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="mt-0.5 text-purple-600">{icon}</div>
      <div>
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function StatCell({ label, value, sub, highlight }: { label: string; value: string | number; sub?: string; highlight?: 'green' | 'red' | 'yellow' | 'purple' }) {
  const textColor = highlight === 'green' ? 'text-green-700' : highlight === 'red' ? 'text-red-700' : highlight === 'yellow' ? 'text-yellow-700' : highlight === 'purple' ? 'text-purple-700' : 'text-gray-900';
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className={clsx('text-lg font-bold mt-1', textColor)}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Analysis Display ─────────────────────────────────────────────────────────

function AnalysisDisplay({ data }: { data: AnalysisResult }) {
  const { quote, globalConditions: gc, structure, psychology, openingScenarios, powerHour, tradePlan, optionsSetup, verdict } = data;
  const isUp = quote.changePercent >= 0;
  const gapUp = quote.gapPercent > 0;

  return (
    <div className="space-y-5">

      {/* ── Hero: Ticker + Price + Verdict ── */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl font-black text-gray-900">{data.ticker}</span>
              <BiasChip bias={verdict.bias} size="lg" />
              {verdict.cleanSetup && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-bold">
                  <Zap size={11} /> CLEAN SETUP
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mb-3">{quote.shortName}</p>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold text-gray-900">${quote.price.toFixed(2)}</span>
              <span className={clsx('text-lg font-semibold', isUp ? 'text-green-600' : 'text-red-600')}>
                {isUp ? '+' : ''}{quote.change.toFixed(2)} ({isUp ? '+' : ''}{quote.changePercent.toFixed(2)}%)
              </span>
            </div>
            <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-500">
              <span>O: <strong className="text-gray-700">${quote.open.toFixed(2)}</strong></span>
              <span>H: <strong className="text-gray-700">${quote.high.toFixed(2)}</strong></span>
              <span>L: <strong className="text-gray-700">${quote.low.toFixed(2)}</strong></span>
              <span>PC: <strong className="text-gray-700">${quote.prevClose.toFixed(2)}</strong></span>
              <span className={clsx('font-semibold', gapUp ? 'text-green-600' : 'text-red-600')}>
                Gap: {gapUp ? '+' : ''}{quote.gapPercent.toFixed(2)}%
              </span>
              <span>Vol: <strong className="text-gray-700">{quote.volumeLabel}</strong> ({quote.volumeRatio.toFixed(1)}x avg)</span>
            </div>
          </div>
          <div className="lg:text-right space-y-2">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Confidence</p>
              <ConfidenceBar value={verdict.confidence} />
            </div>
            <div className={clsx(
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold',
              verdict.bias === 'bullish' ? 'bg-green-50 text-green-700 border border-green-200' :
              verdict.bias === 'bearish' ? 'bg-red-50 text-red-700 border border-red-200' :
              'bg-gray-50 text-gray-700 border border-gray-200'
            )}>
              <BiasIcon bias={verdict.bias} />
              {verdict.recommendation}
            </div>
          </div>
        </div>
      </div>

      {/* ── Global Conditions ── */}
      <Card>
        <SectionHeader icon={<Globe size={18} />} title="Global Market Conditions" subtitle="Macro environment and futures sentiment" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatCell
            label="VIX"
            value={gc.vix.toFixed(1)}
            sub={gc.vixLabel}
            highlight={gc.vix > 25 ? 'red' : gc.vix < 15 ? 'green' : undefined}
          />
          <StatCell
            label="DXY"
            value={gc.dxy.toFixed(2)}
            sub={gc.dxyStrength}
            highlight={gc.dxy > 104 ? 'red' : gc.dxy < 100 ? 'green' : undefined}
          />
          <StatCell
            label="US10Y Yield"
            value={`${gc.tnx.toFixed(2)}%`}
            sub={gc.yieldPressure}
            highlight={gc.tnx > 4.5 ? 'red' : gc.tnx < 4.0 ? 'green' : undefined}
          />
          <StatCell
            label="Oil (CL)"
            value={`$${gc.oil.toFixed(2)}`}
            sub="WTI Crude"
          />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
          <StatCell
            label="ES Futures"
            value={`${gc.esFuturesChange >= 0 ? '+' : ''}${gc.esFuturesChange.toFixed(2)}%`}
            sub="E-mini S&P 500"
            highlight={gc.esFuturesChange > 0.3 ? 'green' : gc.esFuturesChange < -0.3 ? 'red' : undefined}
          />
          <StatCell
            label="NQ Futures"
            value={`${gc.nqFuturesChange >= 0 ? '+' : ''}${gc.nqFuturesChange.toFixed(2)}%`}
            sub="Nasdaq 100 Futures"
            highlight={gc.nqFuturesChange > 0.3 ? 'green' : gc.nqFuturesChange < -0.3 ? 'red' : undefined}
          />
          <div className={clsx(
            'rounded-xl border p-3 flex items-center gap-3',
            gc.riskEnvironment === 'risk-on' ? 'border-green-200 bg-green-50' :
            gc.riskEnvironment === 'risk-off' ? 'border-red-200 bg-red-50' :
            'border-gray-200 bg-gray-50'
          )}>
            <div className={clsx(
              'w-3 h-3 rounded-full',
              gc.riskEnvironment === 'risk-on' ? 'bg-green-500' :
              gc.riskEnvironment === 'risk-off' ? 'bg-red-500' : 'bg-gray-400'
            )} />
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Risk Environment</p>
              <p className={clsx('text-lg font-bold', gc.riskEnvironment === 'risk-on' ? 'text-green-700' : gc.riskEnvironment === 'risk-off' ? 'text-red-700' : 'text-gray-700')}>
                {gc.riskLabel}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
          <p className="text-xs font-semibold text-blue-700 mb-1">Futures Narrative</p>
          <p className="text-sm text-blue-800">{gc.futuresNarrative}</p>
        </div>
      </Card>

      {/* ── Multi-Timeframe Structure + Key Levels ── */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <SectionHeader icon={<Activity size={18} />} title="Multi-Timeframe Structure" subtitle="Trend analysis across all timeframes" />
          <div className="space-y-2">
            {([
              ['Monthly', structure.mtf.monthly],
              ['Weekly', structure.mtf.weekly],
              ['Daily', structure.mtf.daily],
              ['4H', structure.mtf.h4],
              ['1H', structure.mtf.h1],
              ['15M', structure.mtf.m15],
            ] as [string, string][]).map(([tf, desc]) => {
              const isBull = desc.toLowerCase().includes('bullish') || desc.toLowerCase().includes('up') || desc.toLowerCase().includes('higher');
              const isBear = desc.toLowerCase().includes('bearish') || desc.toLowerCase().includes('down') || desc.toLowerCase().includes('lower');
              return (
                <div key={tf} className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                  <span className="text-xs font-bold text-gray-400 w-8 pt-0.5 shrink-0">{tf}</span>
                  <div className={clsx('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', isBull ? 'bg-green-500' : isBear ? 'bg-red-500' : 'bg-gray-400')} />
                  <p className="text-xs text-gray-700 leading-snug">{desc}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>52W Low ${data.quote.fiftyTwoWeekLow.toFixed(2)}</span>
              <span className="font-semibold text-purple-700">{structure.zone}</span>
              <span>52W High ${data.quote.fiftyTwoWeekHigh.toFixed(2)}</span>
            </div>
            <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full" style={{ width: `${structure.rangePosition}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-1.5 text-center">{structure.rangePosition}% of annual range — {structure.from52High.toFixed(1)}% below 52-week high</p>
          </div>
        </Card>

        <Card>
          <SectionHeader icon={<Target size={18} />} title="Key Levels" subtitle="Smart money support, resistance & liquidity zones" />
          <div className="space-y-2">
            {[
              { label: 'Resistance 2', value: structure.keyLevels.resistance2, color: 'text-red-700', bg: 'bg-red-50 border-red-100' },
              { label: 'Resistance 1', value: structure.keyLevels.resistance1, color: 'text-red-600', bg: 'bg-red-50/60 border-red-100' },
              { label: 'Day High', value: structure.keyLevels.dayHigh, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-100' },
              { label: 'VWAP Est.', value: structure.keyLevels.vwapEstimate, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
              { label: 'Day Low', value: structure.keyLevels.dayLow, color: 'text-teal-600', bg: 'bg-teal-50 border-teal-100' },
              { label: 'Support 1', value: structure.keyLevels.support1, color: 'text-green-600', bg: 'bg-green-50/60 border-green-100' },
              { label: 'Support 2', value: structure.keyLevels.support2, color: 'text-green-700', bg: 'bg-green-50 border-green-100' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={clsx('flex items-center justify-between rounded-xl border px-3 py-2', bg)}>
                <span className="text-xs font-medium text-gray-600">{label}</span>
                <span className={clsx('text-sm font-bold', color)}>${value.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <StatCell label="RSI (14)" value={structure.rsi?.toFixed(1) ?? 'N/A'} sub={structure.rsiLabel} highlight={structure.rsi && structure.rsi > 70 ? 'red' : structure.rsi && structure.rsi < 30 ? 'green' : undefined} />
            <StatCell label="ATR" value={`$${data.indicators.atr?.toFixed(2) ?? 'N/A'}`} sub="Daily volatility range" />
          </div>
        </Card>
      </div>

      {/* ── Market Psychology ── */}
      <Card>
        <SectionHeader icon={<BrainCircuit size={18} />} title="Market Psychology" subtitle="Smart money behavior, retail positioning, and trapped trader analysis" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Psychological Narrative</p>
            <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-xl p-4 border border-gray-100">{psychology.narrative}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Trapped Traders</p>
            <div className="rounded-xl border border-yellow-100 bg-yellow-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className="text-yellow-600" />
                <span className="text-sm font-bold text-yellow-800">Currently Trapped: {psychology.trappedTrader.side}</span>
              </div>
              <p className="text-xs text-yellow-800 leading-relaxed">{psychology.trappedTrader.reason}</p>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-5 gap-2">
          {[
            { label: 'Fear/Greed', value: psychology.fearGreedTone },
            { label: 'FOMO Risk', value: psychology.fomoRisk },
            { label: 'Panic Risk', value: psychology.panicRisk },
            { label: 'Squeeze Risk', value: psychology.squeezeRisk },
            { label: 'Capitulation', value: psychology.capitulationRisk },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-gray-100 bg-gray-50 p-2.5 text-center">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <RiskChip level={value} />
            </div>
          ))}
        </div>
      </Card>

      {/* ── Opening Scenarios ── */}
      <Card>
        <SectionHeader icon={<Zap size={18} />} title="Opening Scenario Probabilities" subtitle="Likelihood of each opening scenario based on current structure and futures" />
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-3">
            <ProbabilityBar label="Gap & Go" value={openingScenarios.gapAndGo} color="green" />
            <ProbabilityBar label="Gap Fill" value={openingScenarios.gapFill} color="orange" />
            <ProbabilityBar label="Fake Breakout" value={openingScenarios.fakeBreakout} color="red" />
            <ProbabilityBar label="Liquidity Sweep" value={openingScenarios.liquiditySweep} color="purple" />
          </div>
          <div className="space-y-3">
            <ProbabilityBar label="Open Pump → Dump" value={openingScenarios.openPumpDump} color="red" />
            <ProbabilityBar label="Open Dump → Recovery" value={openingScenarios.openDumpRecovery} color="green" />
            <ProbabilityBar label="Trend Day" value={openingScenarios.trendDay} color="blue" />
            <ProbabilityBar label="Range / Chop Day" value={openingScenarios.chopDay} color="yellow" />
          </div>
        </div>
      </Card>

      {/* ── Power Hour ── */}
      <Card>
        <SectionHeader icon={<Clock size={18} />} title="Power Hour Analysis" subtitle="3:00–4:00 PM ET — institutional positioning and final-hour dynamics" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <ProbabilityBar label="Power Hour Pump / Rally" value={powerHour.pump} color="green" />
            <ProbabilityBar label="Power Hour Dump / Sell-off" value={powerHour.dump} color="red" />
            <ProbabilityBar label="Flat / Range" value={powerHour.flat} color="purple" />
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-2.5 text-center">
                <p className="text-xs text-gray-500 mb-1">Squeeze Risk</p>
                <RiskChip level={powerHour.squeezeRisk} />
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-2.5 text-center">
                <p className="text-xs text-gray-500 mb-1">Profit-Taking Risk</p>
                <RiskChip level={powerHour.profitTakingRisk} />
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-purple-50 border border-purple-100 p-4">
            <p className="text-xs font-semibold text-purple-700 mb-2 uppercase tracking-wide">Power Hour Narrative</p>
            <p className="text-sm text-purple-900 leading-relaxed">{powerHour.narrative}</p>
          </div>
        </div>
      </Card>

      {/* ── Trade Plan ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card accent="border-green-200">
          <SectionHeader icon={<TrendingUp size={18} />} title="Bullish Scenario" subtitle="Entry triggers, targets & invalidation" />
          <div className="space-y-3">
            <div className="rounded-xl bg-green-50 border border-green-100 p-3">
              <p className="text-xs font-semibold text-green-700 mb-1">Entry Trigger</p>
              <p className="text-sm text-green-900">{tradePlan.bullish.entryTrigger}</p>
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
              <p className="text-xs font-semibold text-gray-500 mb-1">Confirmation Signal</p>
              <p className="text-sm text-gray-700">{tradePlan.bullish.confirmation}</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <StatCell label="Target 1" value={`$${tradePlan.bullish.target1.toFixed(2)}`} highlight="green" />
              <StatCell label="Target 2" value={`$${tradePlan.bullish.target2.toFixed(2)}`} highlight="green" />
              <StatCell label="Stop Loss" value={`$${tradePlan.bullish.stopLoss.toFixed(2)}`} highlight="red" />
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
              <p className="text-xs font-semibold text-gray-500 mb-1">Invalidation</p>
              <p className="text-sm text-gray-700">{tradePlan.bullish.invalidation}</p>
            </div>
            <div className="text-center">
              <span className="text-xs text-gray-500">Risk/Reward: </span>
              <span className="text-sm font-bold text-green-700">{tradePlan.bullish.riskReward}:1</span>
            </div>
          </div>
        </Card>

        <Card accent="border-red-200">
          <SectionHeader icon={<TrendingDown size={18} />} title="Bearish Scenario" subtitle="Entry triggers, targets & invalidation" />
          <div className="space-y-3">
            <div className="rounded-xl bg-red-50 border border-red-100 p-3">
              <p className="text-xs font-semibold text-red-700 mb-1">Entry Trigger</p>
              <p className="text-sm text-red-900">{tradePlan.bearish.entryTrigger}</p>
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
              <p className="text-xs font-semibold text-gray-500 mb-1">Confirmation Signal</p>
              <p className="text-sm text-gray-700">{tradePlan.bearish.confirmation}</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <StatCell label="Target 1" value={`$${tradePlan.bearish.target1.toFixed(2)}`} highlight="red" />
              <StatCell label="Target 2" value={`$${tradePlan.bearish.target2.toFixed(2)}`} highlight="red" />
              <StatCell label="Stop Loss" value={`$${tradePlan.bearish.stopLoss.toFixed(2)}`} highlight="green" />
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
              <p className="text-xs font-semibold text-gray-500 mb-1">Invalidation</p>
              <p className="text-sm text-gray-700">{tradePlan.bearish.invalidation}</p>
            </div>
            <div className="text-center">
              <span className="text-xs text-gray-500">Risk/Reward: </span>
              <span className="text-sm font-bold text-red-700">{tradePlan.bearish.riskReward}:1</span>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Options Setup ── */}
      <Card>
        <SectionHeader icon={<BarChart2 size={18} />} title="Options Flow & Setup" subtitle="Institutional options framework — contract selection and risk assessment" />
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-green-100 bg-green-50 p-4">
            <p className="text-xs font-bold text-green-700 mb-1 uppercase">Best Bullish Area</p>
            <p className="text-sm text-green-900">{optionsSetup.bestBullishArea}</p>
          </div>
          <div className="rounded-xl border border-red-100 bg-red-50 p-4">
            <p className="text-xs font-bold text-red-700 mb-1 uppercase">Best Bearish Area</p>
            <p className="text-sm text-red-900">{optionsSetup.bestBearishArea}</p>
          </div>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <p className="text-xs font-semibold text-gray-500 mb-1">Delta Range</p>
              <p className="text-sm text-gray-700">{optionsSetup.deltaRange}</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <p className="text-xs font-semibold text-gray-500 mb-1">Safer Expiration</p>
              <p className="text-sm text-gray-700">{optionsSetup.saferExpiration}</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="rounded-xl border border-yellow-100 bg-yellow-50 p-3">
              <p className="text-xs font-semibold text-yellow-700 mb-1">Theta Risk</p>
              <p className="text-sm text-yellow-900">{optionsSetup.thetaRisk}</p>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
              <p className="text-xs font-semibold text-blue-700 mb-1">IV Risk</p>
              <p className="text-sm text-blue-900">{optionsSetup.ivRisk}</p>
            </div>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-purple-100 bg-purple-50 p-3">
          <p className="text-xs font-semibold text-purple-700 mb-1">Spread Alternative</p>
          <p className="text-sm text-purple-900">{optionsSetup.spreadIdea}</p>
        </div>
        <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
          <p className="text-xs font-semibold text-gray-500 mb-1">Avoid</p>
          <p className="text-sm text-gray-700">{optionsSetup.avoidance}</p>
        </div>
      </Card>

      {/* ── Final Verdict ── */}
      <Card className={clsx(
        'border-2',
        verdict.bias === 'bullish' ? 'border-green-300' :
        verdict.bias === 'bearish' ? 'border-red-300' : 'border-gray-200'
      )}>
        <SectionHeader icon={<Eye size={18} />} title="Final Market Verdict" subtitle="Smart money conclusion — the TRUE outlook" />
        <div className="grid gap-4 lg:grid-cols-3 mb-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Daily Direction</p>
            <p className="text-sm text-gray-800 font-medium">{verdict.dailyDirection}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Weekly Direction</p>
            <p className="text-sm text-gray-800 font-medium">{verdict.weeklyDirection}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Best Entry Style</p>
            <p className={clsx('text-sm font-bold', verdict.bias === 'bullish' ? 'text-green-700' : verdict.bias === 'bearish' ? 'text-red-700' : 'text-gray-700')}>{verdict.recommendation}</p>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-3 mb-5">
          <div className="rounded-xl border border-red-100 bg-red-50 p-3">
            <p className="text-xs font-bold text-red-700 mb-1">Strongest Risk</p>
            <p className="text-xs text-red-800 leading-relaxed">{verdict.strongestRisk}</p>
          </div>
          <div className="rounded-xl border border-green-100 bg-green-50 p-3">
            <p className="text-xs font-bold text-green-700 mb-1">Strongest Bullish Factor</p>
            <p className="text-xs text-green-800 leading-relaxed">{verdict.strongestBullish}</p>
          </div>
          <div className="rounded-xl border border-orange-100 bg-orange-50 p-3">
            <p className="text-xs font-bold text-orange-700 mb-1">Strongest Bearish Factor</p>
            <p className="text-xs text-orange-800 leading-relaxed">{verdict.strongestBearish}</p>
          </div>
        </div>
        <div className={clsx(
          'rounded-xl p-5 border',
          verdict.bias === 'bullish' ? 'bg-green-50 border-green-200' :
          verdict.bias === 'bearish' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
        )}>
          <div className="flex items-center gap-2 mb-3">
            <Shield size={16} className={verdict.bias === 'bullish' ? 'text-green-600' : verdict.bias === 'bearish' ? 'text-red-600' : 'text-gray-500'} />
            <p className="text-xs font-bold uppercase tracking-wide text-gray-600">True Market Outlook</p>
          </div>
          <p className={clsx('text-sm leading-relaxed font-medium', verdict.bias === 'bullish' ? 'text-green-900' : verdict.bias === 'bearish' ? 'text-red-900' : 'text-gray-800')}>{verdict.summary}</p>
        </div>
        <p className="mt-4 text-xs text-gray-400 text-center">Analysis generated {new Date(data.timestamp).toLocaleString()} • Data ~15–20 min delayed • For educational purposes only</p>
      </Card>
    </div>
  );
}

// ─── Quick-pick buttons ───────────────────────────────────────────────────────

const QUICK_TICKERS = ['SPY', 'QQQ', 'NQ', 'ES', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMD', 'SOFI'];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SmartMoneyAnalystPage() {
  const [ticker, setTicker] = useState('SPY');
  const [timeframe, setTimeframe] = useState('intraday');
  const [tradingStyle, setTradingStyle] = useState('day trade');
  const [accountSize, setAccountSize] = useState('');
  const [riskTolerance, setRiskTolerance] = useState('medium');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState('');

  const runAnalysis = useCallback(async (sym?: string) => {
    const symbol = (sym ?? ticker).toUpperCase().trim();
    if (!symbol) return;
    setLoading(true);
    setError('');
    setResult(null);
    if (sym) setTicker(sym);

    try {
      const res = await fetch('/api/smart-money-analyst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: symbol, timeframe, tradingStyle, accountSize: accountSize || null, riskTolerance }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Analysis failed. Try again.');
      } else {
        setResult(data.analysis);
      }
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [ticker, timeframe, tradingStyle, accountSize, riskTolerance]);

  return (
    <AppShell title="Smart Money Analyst">
      <div className="space-y-5">

        {/* ── Hero ── */}
        <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-purple-50 px-3 py-1 text-sm font-semibold text-purple-700">
                <BrainCircuit size={16} /> Smart Money Analyst
              </div>
              <h1 className="mt-3 text-2xl font-bold text-gray-900">Institutional-Grade Market Analysis</h1>
              <p className="mt-1 text-sm text-gray-500 max-w-2xl">
                Multi-timeframe confluence analysis using real market data — structure, liquidity behavior, options flow, market psychology, and smart money positioning. Think like a hedge fund.
              </p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-200">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs font-semibold text-green-700">Live Data</span>
            </div>
          </div>
        </div>

        {/* ── Input Panel ── */}
        <Card>
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Ticker Symbol</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={ticker}
                  onChange={e => setTicker(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && runAnalysis()}
                  placeholder="SPY, QQQ, NVDA..."
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold uppercase text-gray-900 placeholder:normal-case placeholder:font-normal focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
                />
                <button
                  onClick={() => runAnalysis()}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-60 transition-colors"
                >
                  {loading ? <RefreshCw size={15} className="animate-spin" /> : <Search size={15} />}
                  {loading ? 'Analyzing...' : 'Analyze'}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Timeframe</label>
              <select
                value={timeframe}
                onChange={e => setTimeframe(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
              >
                <option value="intraday">Intraday</option>
                <option value="swing">Swing</option>
                <option value="long-term">Long-term</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Trading Style</label>
              <select
                value={tradingStyle}
                onChange={e => setTradingStyle(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
              >
                <option value="scalp">Options Scalp</option>
                <option value="day trade">Day Trade</option>
                <option value="swing">Swing Trade</option>
                <option value="options">Options</option>
                <option value="shares">Shares</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Risk Tolerance</label>
              <select
                value={riskTolerance}
                onChange={e => setRiskTolerance(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          {/* Quick tickers */}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="text-xs text-gray-400 py-1.5 pr-1">Quick:</span>
            {QUICK_TICKERS.map(sym => (
              <button
                key={sym}
                onClick={() => runAnalysis(sym)}
                disabled={loading}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50',
                  ticker === sym ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-purple-50 hover:text-purple-700'
                )}
              >
                {sym}
              </button>
            ))}
          </div>
        </Card>

        {/* ── Loading ── */}
        {loading && (
          <Card className="text-center py-12">
            <RefreshCw size={32} className="animate-spin text-purple-600 mx-auto mb-4" />
            <p className="text-lg font-semibold text-gray-800">Analyzing {ticker}...</p>
            <p className="text-sm text-gray-500 mt-2">Fetching real-time market data, running multi-timeframe analysis, calculating smart money positioning...</p>
            <div className="mt-6 flex justify-center gap-3 text-xs text-gray-400">
              {['Fetching quote data', 'Loading 3M daily candles', 'Fetching global context', 'Running indicator suite', 'Building trade plan'].map((step, i) => (
                <span key={step} className="flex items-center gap-1">
                  <ChevronRight size={10} />
                  {step}
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* ── Error ── */}
        {error && !loading && (
          <Card>
            <div className="flex items-start gap-3 p-2">
              <AlertTriangle size={20} className="text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-700">Analysis Error</p>
                <p className="text-sm text-red-600 mt-1">{error}</p>
              </div>
            </div>
          </Card>
        )}

        {/* ── Empty state ── */}
        {!loading && !error && !result && (
          <Card className="text-center py-12">
            <BrainCircuit size={40} className="text-purple-200 mx-auto mb-4" />
            <p className="text-lg font-semibold text-gray-700">Enter a ticker to begin analysis</p>
            <p className="text-sm text-gray-400 mt-2 max-w-md mx-auto">
              Type any ticker symbol above — stocks, ETFs, indices, or futures — and click Analyze to get an institutional-grade breakdown.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {['SPY', 'QQQ', 'NVDA', 'TSLA', 'AAPL'].map(sym => (
                <button
                  key={sym}
                  onClick={() => runAnalysis(sym)}
                  className="px-4 py-2 rounded-xl bg-purple-50 text-purple-700 text-sm font-semibold hover:bg-purple-100 transition-colors"
                >
                  Analyze {sym}
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* ── Results ── */}
        {result && !loading && <AnalysisDisplay data={result} />}

        {/* ── Disclaimer ── */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-center">
          <p className="text-xs text-gray-400">
            All analysis is algorithmic and educational only. Not financial advice. Options can expire worthless. Past patterns do not guarantee future performance.
            Always confirm with your own research and risk management rules before trading.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

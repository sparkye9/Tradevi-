'use client';

import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Moon, TrendingUp, TrendingDown, Activity, Zap,
  AlertCircle, Shield, Clock, BarChart2,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ScalpSetup {
  entry: string;
  stop: string;
  tp1: number | null;
  tp2: number | null;
  runner: number | null;
}

interface KeyLevels {
  ahHigh: number | null;
  ahLow: number | null;
  regularClose: number;
  vwap: number | null;
  breakoutLevel: number | null;
  breakdownLevel: number | null;
}

interface TickerAnalysis {
  symbol: string;
  shortName: string;
  currentPrice: number;
  regularClose: number;
  ahChange: number;
  ahChangePct: number;
  ahHigh: number | null;
  ahLow: number | null;
  ahRange: number | null;
  vwap: number | null;
  bid: number;
  ask: number;
  spread: number;
  spreadPct: number;
  liquidity: 'SAFE' | 'MODERATE' | 'DANGEROUS';
  trend: string;
  momentumScore: number;
  grade: 'A' | 'B' | 'C' | 'D';
  setupQuality: string;
  rsVsQQQ: string;
  rsVsQQQPct: number;
  ahVolume: number;
  avgDailyVolume: number;
  volSurge: number;
  keyLevels: KeyLevels;
  longSetup: ScalpSetup;
  shortSetup: ScalpSetup;
  preferredDirection: 'long' | 'short' | 'neutral';
  confirmationLogic: string;
  riskWarnings: string[];
  candleCount: number;
  rankScore: number;
  lastAHTradeTime: string | null;
}

interface AHScanResult {
  success: boolean;
  scannedAt: string;
  sessionPhase: 'pre_ah' | 'after_hours' | 'post_ah';
  qqqAHChange: number;
  spyAHChange: number;
  marketCondition: 'bullish' | 'bearish' | 'mixed';
  symbolsScanned: number;
  symbolsWithActivity: number;
  top3: TickerAnalysis[];
  allResults: TickerAnalysis[];
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getETTime(): { timeStr: string; etHour: number } {
  const now = new Date();
  const year = now.getFullYear();
  const mar1Day = new Date(year, 2, 1).getDay();
  const dstStart = new Date(year, 2, mar1Day === 0 ? 8 : 15 - mar1Day);
  const nov1Day = new Date(year, 10, 1).getDay();
  const dstEnd = new Date(year, 10, nov1Day === 0 ? 1 : 8 - nov1Day);
  const etOffset = now >= dstStart && now < dstEnd ? -4 : -5;
  const etMs = now.getTime() + etOffset * 3600 * 1000;
  const d = new Date(etMs);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const s = d.getUTCSeconds();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return {
    timeStr: `${h12}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${ampm} ET`,
    etHour: h,
  };
}

function fmtPrice(n: number | null) {
  if (n === null) return '—';
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function fmtVol(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function GradeBadge({ grade }: { grade: string }) {
  const cls =
    grade === 'A'    ? 'bg-green-100 text-green-800 border border-green-200' :
    grade === 'B'    ? 'bg-blue-100 text-blue-800 border border-blue-200' :
    grade === 'C'    ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
    grade === 'WAIT' ? 'bg-gray-100 text-gray-600 border border-gray-200' :
                       'bg-red-100 text-red-700 border border-red-200';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${cls}`}>
      {grade}
    </span>
  );
}

function LiquidityBadge({ liq }: { liq: string }) {
  const cls =
    liq === 'SAFE'      ? 'bg-green-50 text-green-700 border border-green-200' :
    liq === 'MODERATE'  ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                          'bg-red-50 text-red-700 border border-red-200';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {liq}
    </span>
  );
}

function MomentumBar({ score }: { score: number }) {
  const pct = (score / 10) * 100;
  const color =
    score >= 8 ? 'bg-green-500' :
    score >= 6 ? 'bg-blue-500' :
    score >= 5 ? 'bg-yellow-500' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-bold text-gray-800 w-10 text-right">{score}/10</span>
    </div>
  );
}

function SetupCard({ result, rank }: { result: TickerAnalysis; rank: number }) {
  const isWait = result.setupQuality === 'WAIT';
  const isLong = result.preferredDirection === 'long';
  const isShort = result.preferredDirection === 'short';
  const preferred = isLong ? result.longSetup : isShort ? result.shortSetup : null;

  const borderColor =
    isWait ? 'border-gray-200' :
    isLong ? 'border-green-200' :
    isShort ? 'border-red-200' :
              'border-gray-200';

  const headerBg =
    isWait ? 'bg-gray-50' :
    isLong ? 'bg-green-50' :
    isShort ? 'bg-red-50' :
              'bg-gray-50';

  return (
    <div className={`rounded-2xl border-2 ${borderColor} overflow-hidden`}>
      {/* Header */}
      <div className={`${headerBg} px-5 py-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-gray-400">#{rank} RANKED</span>
              {isWait && (
                <span className="text-xs font-bold text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                  WAIT
                </span>
              )}
              {!isWait && result.grade === 'A' && (
                <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                  HIGH PROBABILITY
                </span>
              )}
            </div>
            <h2 className="text-2xl font-bold text-gray-900">{result.symbol}</h2>
            <p className="text-sm text-gray-500">{result.shortName}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GradeBadge grade={result.setupQuality} />
            <LiquidityBadge liq={result.liquidity} />
            {result.preferredDirection !== 'neutral' && (
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                isLong
                  ? 'bg-green-100 text-green-800 border-green-200'
                  : 'bg-red-100 text-red-800 border-red-200'
              }`}>
                {isLong ? 'LONG BIAS' : 'SHORT BIAS'}
              </span>
            )}
          </div>
        </div>

        {/* Price + AH change */}
        <div className="flex flex-wrap gap-6 items-end">
          <div>
            <p className="text-xs text-gray-500">AH Price</p>
            <p className="text-xl font-bold text-gray-900">{fmtPrice(result.currentPrice)}</p>
            <p className={`text-sm font-semibold ${result.ahChangePct >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {fmtPct(result.ahChangePct)} ({result.ahChange >= 0 ? '+' : ''}{result.ahChange.toFixed(2)})
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Reg. Close</p>
            <p className="text-sm font-semibold text-gray-700">{fmtPrice(result.regularClose)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Spread</p>
            <p className="text-sm font-semibold text-gray-700">
              {result.spreadPct.toFixed(3)}%
              {' '}({result.spread > 0 ? `$${result.spread.toFixed(2)}` : '—'})
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">RS vs QQQ</p>
            <p className={`text-sm font-semibold ${
              result.rsVsQQQ === 'Outperforming' ? 'text-green-700' :
              result.rsVsQQQ === 'Underperforming' ? 'text-red-700' : 'text-gray-600'
            }`}>
              {result.rsVsQQQ} ({fmtPct(result.rsVsQQQPct)})
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">AH Volume</p>
            <p className="text-sm font-semibold text-gray-700">
              {fmtVol(result.ahVolume)} ({result.volSurge.toFixed(1)}x)
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Trend + Momentum + Key Levels */}
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Trend & Momentum</p>
            <div className="flex items-center gap-2 mb-2">
              {result.trend.toLowerCase().includes('bullish') && <TrendingUp size={14} className="text-green-600" />}
              {result.trend.toLowerCase().includes('bearish') && <TrendingDown size={14} className="text-red-600" />}
              {(result.trend.includes('chop') || result.trend.includes('Range')) && <Activity size={14} className="text-gray-500" />}
              {result.trend.includes('Exhaustion') && <AlertCircle size={14} className="text-orange-500" />}
              <span className="text-sm font-semibold text-gray-800">{result.trend}</span>
            </div>
            <MomentumBar score={result.momentumScore} />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Key Levels</p>
            <div className="space-y-1 text-xs">
              {[
                { label: 'AH High',     value: result.keyLevels.ahHigh,      color: 'text-green-700', bg: 'bg-green-50' },
                { label: 'VWAP',        value: result.keyLevels.vwap,        color: 'text-purple-700', bg: 'bg-purple-50' },
                { label: 'Reg. Close',  value: result.keyLevels.regularClose, color: 'text-orange-700', bg: 'bg-orange-50' },
                { label: 'AH Low',      value: result.keyLevels.ahLow,        color: 'text-red-700', bg: 'bg-red-50' },
              ].map(({ label, value, color, bg }) => (
                <div key={label} className={`flex justify-between items-center rounded-lg px-3 py-1.5 ${bg}`}>
                  <span className="font-medium text-gray-600">{label}</span>
                  <span className={`font-bold ${color}`}>{fmtPrice(value ?? null)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Primary Setup */}
        <div className="space-y-4">
          {preferred && !isWait && (
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${isLong ? 'text-green-600' : 'text-red-600'}`}>
                {isLong ? 'Long Scalp Setup' : 'Short Scalp Setup'}
              </p>
              <div className="space-y-2 text-xs">
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="font-semibold text-gray-700 mb-0.5">Entry</p>
                  <p className="text-gray-600">{preferred.entry}</p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="font-semibold text-gray-700 mb-0.5">Stop</p>
                  <p className="text-gray-600">{preferred.stop}</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'TP1',    value: preferred.tp1 },
                    { label: 'TP2',    value: preferred.tp2 },
                    { label: 'Runner', value: preferred.runner },
                  ].map(({ label, value }) => (
                    <div key={label} className={`rounded-lg p-2 text-center border ${
                      isLong ? 'bg-green-50 border-green-100 text-green-800' : 'bg-red-50 border-red-100 text-red-800'
                    }`}>
                      <p className="text-gray-500 text-xs">{label}</p>
                      <p className="font-bold text-xs mt-0.5">{fmtPrice(value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {isWait && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
              <Activity size={24} className="mx-auto mb-2 text-gray-400" />
              <p className="font-semibold text-gray-600 text-sm">WAIT</p>
              <p className="text-xs text-gray-400 mt-1">Setup quality is too low. Conditions not favorable for this ticker.</p>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Confirmation Required</p>
            <p className="text-xs text-gray-600 rounded-lg bg-blue-50 border border-blue-100 p-3 leading-relaxed">
              {result.confirmationLogic}
            </p>
          </div>
        </div>
      </div>

      {/* Risk Warnings */}
      {result.riskWarnings.length > 0 && (
        <div className="px-5 pb-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
              <AlertCircle size={12} /> Risk Warnings
            </p>
            <ul className="space-y-1">
              {result.riskWarnings.map((w, i) => (
                <li key={i} className="text-xs text-amber-700">• {w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-5 pb-4 flex flex-wrap gap-4 text-xs text-gray-400 border-t border-gray-100 pt-3">
        <span>Best timeframe: <strong className="text-gray-600">1m entry · 5m trend</strong></span>
        <span>AH candles: <strong className="text-gray-600">{result.candleCount}</strong></span>
        {result.lastAHTradeTime && (
          <span>Last AH trade: <strong className="text-gray-600">{new Date(result.lastAHTradeTime).toLocaleTimeString()}</strong></span>
        )}
      </div>
    </div>
  );
}

function ScanRow({ result }: { result: TickerAnalysis }) {
  const chgColor = result.ahChangePct >= 0 ? 'text-green-700' : 'text-red-700';
  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
      <td className="py-2.5 px-3 font-semibold text-gray-900 text-sm">
        {result.symbol}
        {result.riskWarnings.length > 0 && (
          <AlertCircle size={11} className="inline ml-1 text-amber-500 mb-0.5" />
        )}
      </td>
      <td className="py-2.5 px-3 text-sm text-gray-700">{fmtPrice(result.currentPrice)}</td>
      <td className={`py-2.5 px-3 text-sm font-semibold ${chgColor}`}>{fmtPct(result.ahChangePct)}</td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <div className="w-16 bg-gray-100 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full ${result.momentumScore >= 8 ? 'bg-green-500' : result.momentumScore >= 6 ? 'bg-blue-500' : result.momentumScore >= 5 ? 'bg-yellow-400' : 'bg-red-400'}`}
              style={{ width: `${(result.momentumScore / 10) * 100}%` }}
            />
          </div>
          <span className="text-xs font-bold text-gray-700">{result.momentumScore}</span>
        </div>
      </td>
      <td className="py-2.5 px-3"><GradeBadge grade={result.setupQuality} /></td>
      <td className="py-2.5 px-3"><LiquidityBadge liq={result.liquidity} /></td>
      <td className="py-2.5 px-3 text-xs text-gray-600">{result.trend}</td>
      <td className={`py-2.5 px-3 text-xs font-medium ${
        result.rsVsQQQ === 'Outperforming' ? 'text-green-700' :
        result.rsVsQQQ === 'Underperforming' ? 'text-red-700' : 'text-gray-500'
      }`}>
        {result.rsVsQQQ} ({fmtPct(result.rsVsQQQPct)})
      </td>
      <td className="py-2.5 px-3 text-xs text-gray-500">{fmtVol(result.ahVolume)}</td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AfterHoursPage() {
  const [scanData,    setScanData]    = useState<AHScanResult | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [etTime,      setEtTime]      = useState(() => getETTime());

  useEffect(() => {
    const id = setInterval(() => setEtTime(getETTime()), 1000);
    return () => clearInterval(id);
  }, []);

  const scan = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/after-hours');
      const data: AHScanResult = await res.json();
      if (!data.success) throw new Error(data.error ?? 'Scan failed');
      setScanData(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    }
    setLoading(false);
  }, []);

  const isAHActive = etTime.etHour >= 16 && etTime.etHour < 20;
  const phaseLabel =
    scanData?.sessionPhase === 'after_hours' ? 'After-Hours Active (4–8 PM ET)' :
    scanData?.sessionPhase === 'pre_ah'      ? 'Market Open — AH starts at 4:00 PM ET' :
                                               'AH Session Ended';

  const conditionUnfavorable =
    scanData !== null &&
    (scanData.marketCondition === 'mixed' || scanData.top3.length === 0 || scanData.top3.every(t => t.setupQuality === 'WAIT'));

  const mcColor =
    scanData?.marketCondition === 'bullish' ? 'text-green-700' :
    scanData?.marketCondition === 'bearish' ? 'text-red-700' : 'text-yellow-700';

  return (
    <AppShell title="After-Hours Scalp Engine">
      {/* Disclaimer */}
      <div className="p-3 mb-5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
        <strong>Education Only:</strong> After-hours data is delayed ~15–20 min via Yahoo Finance. AH liquidity is thin —
        spreads widen significantly. All setups are for educational reference only. Never trade based solely on this tool.
      </div>

      {/* Hero */}
      <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
              <Moon size={15} /> After-Hours Scalp Engine
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-gray-900">
              High-Probability AH Setups
            </h1>
            <p className="mt-2 text-sm text-gray-500 max-w-2xl">
              Scans SPY, QQQ, NVDA, TSLA, AAPL, META, AMD, and more for the cleanest
              after-hours scalp opportunities — ranked by momentum, liquidity, and setup quality.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className={`flex items-center gap-2 rounded-xl px-4 py-2 border font-mono text-sm font-semibold ${
              isAHActive
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                : 'bg-gray-50 border-gray-200 text-gray-600'
            }`}>
              <Clock size={15} />
              {etTime.timeStr}
            </div>
            {isAHActive && (
              <span className="text-xs font-bold text-indigo-600 animate-pulse">
                AH SESSION LIVE
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Button onClick={scan} loading={loading}>
          <Zap size={14} className="mr-1.5" />
          Scan After-Hours
        </Button>
        {lastUpdated && (
          <span className="text-xs text-gray-400">Last scan: {lastUpdated}</span>
        )}
        <span className="text-xs text-gray-400">
          Scanning: SPY · QQQ · NVDA · TSLA · AAPL · META · AMD · MSFT · TQQQ · SQQQ · IWM · PLTR · AMZN · SOFI
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-20">
          <div className="w-8 h-8 border-[3px] border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-gray-500 text-sm">Scanning 14 tickers and fetching AH candle data…</p>
        </div>
      )}

      {/* Results */}
      {scanData && !loading && (
        <div className="space-y-6">

          {/* NO TRADE warning */}
          {conditionUnfavorable && (
            <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-5 text-center">
              <AlertCircle size={32} className="text-red-400 mx-auto mb-2" />
              <p className="text-xl font-bold text-red-700">NO TRADE — CONDITIONS UNFAVORABLE</p>
              <p className="text-sm text-red-600 mt-1">
                Market conditions are mixed or no high-probability setups detected. Preserve capital — sit out.
              </p>
            </div>
          )}

          {/* Market overview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className={`rounded-xl border p-4 ${
              scanData.qqqAHChange > 0 ? 'bg-green-50 border-green-100' : scanData.qqqAHChange < 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'
            }`}>
              <p className="text-xs font-medium text-gray-500">QQQ After-Hours</p>
              <p className={`text-xl font-bold mt-1 ${scanData.qqqAHChange >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {fmtPct(scanData.qqqAHChange)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Market indicator</p>
            </div>
            <div className={`rounded-xl border p-4 ${
              scanData.spyAHChange > 0 ? 'bg-green-50 border-green-100' : scanData.spyAHChange < 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'
            }`}>
              <p className="text-xs font-medium text-gray-500">SPY After-Hours</p>
              <p className={`text-xl font-bold mt-1 ${scanData.spyAHChange >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {fmtPct(scanData.spyAHChange)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Broad market</p>
            </div>
            <div className={`rounded-xl border p-4 ${
              scanData.marketCondition === 'bullish' ? 'bg-green-50 border-green-100' :
              scanData.marketCondition === 'bearish' ? 'bg-red-50 border-red-100' :
              'bg-yellow-50 border-yellow-100'
            }`}>
              <p className="text-xs font-medium text-gray-500">AH Market Bias</p>
              <p className={`text-xl font-bold mt-1 capitalize ${mcColor}`}>
                {scanData.marketCondition}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{phaseLabel}</p>
            </div>
            <div className="rounded-xl border bg-indigo-50 border-indigo-100 p-4">
              <p className="text-xs font-medium text-gray-500">Tickers Active</p>
              <p className="text-xl font-bold mt-1 text-indigo-700">
                {scanData.symbolsWithActivity} / {scanData.symbolsScanned}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">with AH movement</p>
            </div>
          </div>

          {/* Top 3 setups */}
          {scanData.top3.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <BarChart2 size={18} className="text-indigo-600" />
                  <h2 className="text-lg font-semibold text-gray-900">Top Ranked Setups</h2>
                </div>
                <Badge variant="default">Ranked by probability · liquidity · R/R</Badge>
              </div>
              <div className="space-y-4">
                {scanData.top3.map((result, i) => (
                  <SetupCard key={result.symbol} result={result} rank={i + 1} />
                ))}
              </div>
            </div>
          )}

          {scanData.top3.length === 0 && !conditionUnfavorable && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-6 text-center text-sm text-gray-500">
              <Moon size={28} className="mx-auto mb-2 opacity-30" />
              No scoreable setups found. AH activity may be minimal or spreads are too wide.
            </div>
          )}

          {/* Full scan table */}
          {scanData.allResults.length > 0 && (
            <Card>
              <CardHeader
                title="Full Scan Results"
                icon={<Activity size={16} />}
                subtitle={`${scanData.allResults.length} tickers with AH activity — sorted by rank score`}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Symbol', 'AH Price', 'AH Chg%', 'Score', 'Grade', 'Liquidity', 'Trend', 'RS vs QQQ', 'AH Vol'].map(h => (
                        <th key={h} className="py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scanData.allResults.map(r => (
                      <ScanRow key={r.symbol} result={r} />
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Rules */}
          <Card>
            <CardHeader title="After-Hours Scalp Rules" icon={<Shield size={16} className="text-indigo-600" />} />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 text-xs text-gray-600">
              {[
                ['Grade A/B only', 'Never take C or D grade setups in AH. The risk/reward deteriorates fast with thin liquidity.'],
                ['Spread must be SAFE', "If liquidity shows MODERATE or DANGEROUS, don't enter. You'll lose edge before the trade starts."],
                ['Volume confirmation required', 'Only enter when the breakout candle shows 1.5x+ the AH average volume. No volume = no trade.'],
                ['QQQ/SPY must agree', "If you're long a stock but QQQ is dropping in AH, the trade has headwind. Skip it."],
                ['5–30 minute holds only', 'AH scalps are fast. Set a hard exit at 30 minutes. Do not hold overnight without a plan.'],
                ['Target 20–40% on options', 'AH moves spike and reverse quickly. Take profits at 20–40% gain. Do not get greedy.'],
                ['Avoid chasing extensions', 'If the stock is already up >3% in AH without a pullback, wait for consolidation — not a breakout chase.'],
                ['Size down', 'AH = higher volatility + lower liquidity. Use 25–50% of your normal position size.'],
                ['Watch for exhaustion', 'Big gap-up or gap-down followed by stalling candles = fade risk. The engine flags this as Exhaustion move.'],
              ].map(([rule, detail]) => (
                <div key={rule} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <p className="font-semibold text-gray-800 mb-1">{rule}</p>
                  <p>{detail}</p>
                </div>
              ))}
            </div>
          </Card>

          <p className="text-xs text-gray-400 text-center">
            Scanned at {new Date(scanData.scannedAt).toLocaleTimeString()} · Yahoo Finance delayed data
          </p>
        </div>
      )}

      {/* Empty state */}
      {!scanData && !loading && !error && (
        <div className="text-center py-20">
          <Moon size={48} className="text-indigo-200 mx-auto mb-4" />
          <p className="text-gray-600 font-medium text-lg">Click Scan After-Hours to begin</p>
          <p className="text-gray-400 text-sm mt-2 max-w-md mx-auto">
            Scans 14 priority tickers for after-hours momentum, calculates VWAP and key levels from 1-minute
            candles, ranks setups by probability and liquidity, and surfaces the top 3 cleanest scalp setups.
          </p>
          {!isAHActive && (
            <p className="mt-4 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 inline-block">
              Market is not in AH session (4–8 PM ET). Data shown will be from the last AH session.
            </p>
          )}
        </div>
      )}
    </AppShell>
  );
}

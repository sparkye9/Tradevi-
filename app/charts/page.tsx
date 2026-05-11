'use client';
import { useState, useCallback, useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { CandleChart } from '@/components/charts/CandleChart';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import type { CandleData } from '@/lib/types';
import { calcTFC, DEFAULT_TFC_PARAMS, type TFCParams, type TFCOutput } from '@/lib/tfc';
import { RefreshCw, Settings, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';

const SYMBOLS = ['SPY', 'QQQ', 'TSLA', 'NVDA', 'AAPL', 'MSFT', 'AMZN', 'META'];

const INTERVALS: { label: string; value: string; period: string }[] = [
  { label: '5m',  value: '5m',  period: '5d' },
  { label: '15m', value: '15m', period: '1mo' },
  { label: '1H',  value: '60m', period: '3mo' },
  { label: '1D',  value: '1d',  period: '1y' },
];

const PARAM_FIELDS: { label: string; key: keyof TFCParams; step: number }[] = [
  { label: 'ST1 Factor',   key: 'st1Factor',   step: 0.05 },
  { label: 'ST1 Period',   key: 'st1Period',   step: 1 },
  { label: 'ST2 Factor',   key: 'st2Factor',   step: 0.05 },
  { label: 'ST2 Period',   key: 'st2Period',   step: 1 },
  { label: 'EMA Fast',     key: 'emaFast',     step: 1 },
  { label: 'EMA Slow',     key: 'emaSlow',     step: 1 },
  { label: 'Aroon Len',    key: 'aroonLength', step: 1 },
  { label: 'DMI Len',      key: 'dmiLength',   step: 1 },
  { label: 'LRSI Alpha',   key: 'lrsiAlpha',   step: 0.05 },
  { label: 'LRSI FE Len',  key: 'lrsiFeLength',step: 1 },
  { label: 'Threshold',    key: 'threshold',   step: 1 },
];

function StrengthBar({ value, max = 5 }: { value: number; max?: number }) {
  const filled = Math.abs(value);
  const bull = value > 0;
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={`h-2.5 w-4 rounded-sm ${
            i < filled
              ? bull ? 'bg-green-500' : 'bg-red-500'
              : 'bg-gray-200'
          }`}
        />
      ))}
    </div>
  );
}

export default function ChartsPage() {
  const [symbol, setSymbol] = useState('SPY');
  const [intervalCfg, setIntervalCfg] = useState(INTERVALS[3]);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [indicators, setIndicators] = useState<TFCOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [params, setParams] = useState<TFCParams>(DEFAULT_TFC_PARAMS);
  const [showSettings, setShowSettings] = useState(false);

  const fetchAndCalc = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/chart?symbol=${symbol}&period=${intervalCfg.period}&interval=${intervalCfg.value}`
      );
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const c: CandleData[] = data.candles ?? [];
      setCandles(c);
      setIndicators(c.length > 1 ? calcTFC(c, params) : null);
    } catch {
      setError('Failed to load chart data. Using cached data if available.');
    }
    setLoading(false);
  }, [symbol, intervalCfg, params]);

  useEffect(() => { fetchAndCalc(); }, [fetchAndCalc]);

  const currentDir = indicators?.superTrendDir.at(-1) ?? 0;
  const currentStr = indicators?.trendStrength.at(-1) ?? 0;
  const lastRSI = indicators?.rsi.filter(v => v !== null).at(-1) ?? null;
  const lastLRSI = indicators?.lrsi.filter(v => v !== null).at(-1) ?? null;
  const entryCount = indicators?.entrySignals.length ?? 0;

  const indicatorStatuses = indicators ? [
    {
      label: 'EMA Cross',
      active: (() => {
        const ef = indicators.ema20, es = indicators.ema50;
        const i = ef.length - 1;
        const f = ef[i], s = es[i];
        return f !== null && s !== null ? (f > s ? 1 : -1) : 0;
      })(),
    },
    {
      label: 'Aroon',
      active: (() => {
        const up = indicators.aroonUp.filter(v => v !== null).at(-1) ?? null;
        const dn = indicators.aroonDown.filter(v => v !== null).at(-1) ?? null;
        if (up === null || dn === null) return 0;
        return up > dn ? 1 : dn > up ? -1 : 0;
      })(),
    },
    {
      label: 'DMI',
      active: (() => {
        const p = indicators.diPlus.filter(v => v !== null).at(-1) ?? null;
        const m = indicators.diMinus.filter(v => v !== null).at(-1) ?? null;
        if (p === null || m === null) return 0;
        return p > m ? 1 : m > p ? -1 : 0;
      })(),
    },
    {
      label: 'LRSI',
      active: lastLRSI !== null ? (lastLRSI > 0.6 ? 1 : lastLRSI < 0.4 ? -1 : 0) : 0,
    },
  ] : [];

  return (
    <AppShell title="Technical Charts">
      {/* Symbol + interval controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {SYMBOLS.map(s => (
            <button
              key={s}
              onClick={() => setSymbol(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                symbol === s
                  ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden border border-gray-200 bg-white">
            {INTERVALS.map(iv => (
              <button
                key={iv.value}
                onClick={() => setIntervalCfg(iv)}
                className={`px-3 py-1.5 text-xs font-medium border-r border-gray-200 last:border-0 transition-colors ${
                  intervalCfg.value === iv.value
                    ? 'bg-purple-100 text-purple-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {iv.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowSettings(s => !s)}
            title="Indicator settings"
            className={`p-2 rounded-lg border text-xs transition-colors ${
              showSettings ? 'bg-purple-100 border-purple-300 text-purple-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Settings size={14} />
          </button>
          <Button size="sm" variant="outline" onClick={fetchAndCalc} loading={loading}>
            <RefreshCw size={13} />
          </Button>
        </div>
      </div>

      {/* TFC status bar */}
      {indicators && (
        <div className="flex flex-wrap gap-2 mb-4">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
            currentDir === 1  ? 'bg-green-50 text-green-700 border-green-200' :
            currentDir === -1 ? 'bg-red-50 text-red-700 border-red-200' :
                                'bg-gray-50 text-gray-600 border-gray-200'
          }`}>
            {currentDir === 1  ? <TrendingUp size={12} /> :
             currentDir === -1 ? <TrendingDown size={12} /> :
                                 <Minus size={12} />}
            SuperTrend: {currentDir === 1 ? 'BULLISH' : currentDir === -1 ? 'BEARISH' : 'NEUTRAL'}
          </div>

          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
            Math.abs(currentStr) >= params.threshold
              ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
              : 'bg-gray-50 text-gray-600 border-gray-200'
          }`}>
            <span>TFC {currentStr > 0 ? '+' : ''}{currentStr}/5</span>
            <StrengthBar value={currentStr} />
            {Math.abs(currentStr) >= params.threshold && (
              <span className="text-yellow-600 font-bold">⚡ ENTRY</span>
            )}
          </div>

          {lastRSI !== null && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              lastRSI > 70 ? 'bg-green-50 text-green-700 border-green-200' :
              lastRSI < 30 ? 'bg-red-50 text-red-700 border-red-200' :
                             'bg-gray-50 text-gray-600 border-gray-200'
            }`}>
              RSI {lastRSI.toFixed(1)}
              {lastRSI > 70 ? ' · Overbought' : lastRSI < 30 ? ' · Oversold' : ''}
            </div>
          )}

          {indicatorStatuses.map(s => (
            <div key={s.label} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
              s.active === 1  ? 'bg-green-50 text-green-700 border-green-200' :
              s.active === -1 ? 'bg-red-50 text-red-700 border-red-200' :
                                'bg-gray-50 text-gray-400 border-gray-200'
            }`}>
              {s.active === 1  ? <TrendingUp size={10} /> :
               s.active === -1 ? <TrendingDown size={10} /> :
                                  <Minus size={10} />}
              {s.label}
            </div>
          ))}

          {entryCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200">
              ⚡ {entryCount} signal{entryCount > 1 ? 's' : ''} on chart
            </div>
          )}
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <Card className="mb-4">
          <CardHeader title="TFC Indicator Parameters" icon={<Settings size={14} />} />
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {PARAM_FIELDS.map(({ label, key, step }) => (
              <div key={key}>
                <label className="text-xs text-gray-500 block mb-1">{label}</label>
                <input
                  type="number"
                  step={step}
                  value={params[key]}
                  onChange={e => setParams(p => ({ ...p, [key]: Number(e.target.value) }))}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:ring-1 focus:ring-purple-200 focus:border-purple-400 outline-none"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Parameters update automatically when changed. ST2 Period needs sufficient historical data (use 1D interval for large periods).
          </p>
        </Card>
      )}

      {/* Indicator legend */}
      <div className="flex flex-wrap gap-3 mb-2 text-xs">
        {[
          { color: '#c084fc', label: 'RSI Bars (green candle RSI>70, red RSI<30)' },
          { color: '#60a5fa', label: 'EMA 20' },
          { color: '#eab308', label: 'EMA 50' },
          { color: '#22c55e', label: 'SuperTrend (bullish)' },
          { color: '#ef4444', label: 'SuperTrend (bearish)' },
          { color: '#22c55e', label: 'VWAP', dashed: true },
          { color: '#fbbf24', label: '⚡ TFC Entry Signal' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5 text-gray-600">
            <div className="flex items-center gap-1">
              <div
                className={`h-2 rounded-full ${item.dashed ? 'w-4 border-t border-dashed' : 'w-4'}`}
                style={{ backgroundColor: item.dashed ? 'transparent' : item.color, borderColor: item.color }}
              />
            </div>
            <span className="text-gray-500">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-[#0d1117] rounded-xl overflow-hidden border border-gray-800">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-[540px] gap-3 text-gray-500">
            <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Loading {symbol} {intervalCfg.label} chart…</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-96 text-red-400 text-sm gap-2">
            <AlertTriangle size={16} /> {error}
          </div>
        ) : candles.length > 0 && indicators ? (
          <CandleChart candles={candles} indicators={indicators} mainHeight={420} rsiHeight={115} />
        ) : (
          <div className="flex items-center justify-center h-96 text-gray-500 text-sm">No data available</div>
        )}
      </div>

      {/* How-to explanation */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 bg-blue-50 rounded-xl text-xs text-blue-800 space-y-1.5">
          <p className="font-bold text-sm">📊 TFC — Trend-Following Combo</p>
          <p><strong>SuperTrend (green/red line):</strong> Two SuperTrend lines must agree to show a combined trend. Green = bullish floor, Red = bearish ceiling.</p>
          <p><strong>EMA Cross (8/15):</strong> Fast EMA above/below slow EMA confirms momentum direction.</p>
          <p><strong>Aroon:</strong> Measures how recently the high/low occurred. Bull when Aroon Upper {'>'} Lower.</p>
          <p><strong>DMI:</strong> DI+ above DI- = buyers in control.</p>
          <p><strong>Laguerre RSI:</strong> Adaptive RSI using fractal energy. Smoother signals than standard RSI.</p>
          <p><strong>⚡ Entry Arrow:</strong> Fires when SuperTrend + {params.threshold}+ indicators all agree. Yellow arrow on chart.</p>
        </div>
        <div className="p-4 bg-purple-50 rounded-xl text-xs text-purple-800 space-y-1.5">
          <p className="font-bold text-sm">🎨 RSI Bar Coloring</p>
          <p><strong>Bright green candle:</strong> RSI {'>'} 70 — overbought territory. Momentum is strong but watch for reversal.</p>
          <p><strong>Bright red candle:</strong> RSI {'<'} 30 — oversold territory. Possible bounce setup.</p>
          <p><strong>Normal candles:</strong> Standard bullish (green) or bearish (red) coloring.</p>
          <p className="mt-2 font-bold text-sm">⚠️ Usage Notes</p>
          <p>Use TFC signals to time <em>options entries</em>. A bullish TFC signal may support buying calls; bearish → puts. Always confirm in your broker.</p>
          <p>Longer timeframes (1D) with 1-year data give the most reliable TFC signals.</p>
        </div>
      </div>

      <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-xs text-amber-800">
        <AlertTriangle size={13} className="flex-shrink-0 mt-0.5 text-amber-600" />
        <p><strong>For analysis only.</strong> Chart signals do not guarantee future performance. Always confirm in your broker before entering any trade. Cheap options expire worthless most of the time.</p>
      </div>
    </AppShell>
  );
}

'use client';
import { useState, useCallback, useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { OverlayControls } from '@/components/charts/OverlayControls';
import { Button } from '@/components/ui/Button';
import { DataSourceBanner, type DataSource } from '@/components/ui/DataSourceBanner';
import { fetchChart, type ChartResponse, type StockAnalysis } from '@/lib/apiClient';
import { useTickerPrice } from '@/lib/wsClient';
import { RefreshCw, WifiOff, Zap, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import dynamic from 'next/dynamic';

const TradingViewChart = dynamic(() => import('@/components/charts/TradingViewChart'), { ssr: false });

const SYMBOLS = ['SPY', 'QQQ', 'TSLA', 'NVDA', 'AAPL', 'MSFT', 'AMZN', 'META', 'AMD', 'PLTR'];

const PERIODS = [
  { label: '1D', value: '1d' },
  { label: '5D', value: '5d' },
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '1Y', value: '1y' },
] as const;

type PeriodValue = (typeof PERIODS)[number]['value'];

const DEFAULT_OVERLAYS = {
  showEMA9: false,
  showEMA20: true,
  showEMA50: true,
  showEMA200: false,
  showVWAP: true,
  showBollinger: false,
  showSuperTrend: true,
  showMACD: true,
  showRSI: true,
  showVolume: true,
};

export default function ChartsPage() {
  const [symbol, setSymbol] = useState('SPY');
  const [period, setPeriod] = useState<PeriodValue>('3mo');
  const [chartData, setChartData] = useState<ChartResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dataSource, setDataSource] = useState<DataSource>(null);
  const [overlays, setOverlays] = useState(DEFAULT_OVERLAYS);

  const { price: livePrice, connected: wsConnected } = useTickerPrice({ symbol });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchChart(symbol, period);
      setChartData(data);
      setDataSource((data.meta.dataSource as DataSource) ?? 'yahoo_delayed');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load chart data');
      setDataSource(null);
    }
    setLoading(false);
  }, [symbol, period]);

  useEffect(() => { load(); }, [load]);

  const analysis: StockAnalysis | null = chartData?.analysis ?? null;
  const displayPrice = livePrice ?? (chartData?.candles?.at(-1)?.close ?? null);

  const biasBadge = analysis?.bias
    ? ({
        bullish: 'bg-green-100 text-green-700',
        bearish: 'bg-red-100 text-red-700',
        neutral: 'bg-gray-100 text-gray-600',
      } as const)[analysis.bias]
    : '';

  return (
    <AppShell title="Technical Charts">
      <DataSourceBanner dataSource={dataSource} fetchedAt={chartData?.meta.fetchedAt ?? null} className="mb-4" />

      {/* Symbol + Period selector */}
      <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
        <div className="flex flex-wrap gap-1.5">
          {SYMBOLS.map(sym => (
            <button
              key={sym}
              onClick={() => setSymbol(sym)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                symbol === sym
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
              }`}
            >
              {sym}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  period === p.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={load} loading={loading}>
            <RefreshCw size={13} />
          </Button>
        </div>
      </div>

      {/* Price header + analysis status bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="text-xl font-bold text-gray-900">{symbol}</h2>
        {displayPrice && (
          <span className="text-lg font-semibold text-gray-700">${displayPrice.toFixed(2)}</span>
        )}
        {analysis && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${biasBadge}`}>
            {analysis.bias.toUpperCase()}
          </span>
        )}
        {wsConnected && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <Zap size={9} /> Live
          </span>
        )}
        {analysis && (
          <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span>
              RSI{' '}
              <strong className={analysis.rsi > 70 ? 'text-red-600' : analysis.rsi < 30 ? 'text-green-600' : 'text-gray-700'}>
                {analysis.rsi.toFixed(1)}
              </strong>
            </span>
            <span>ATR <strong className="text-gray-700">${analysis.atr.toFixed(2)}</strong></span>
            <span>Support <strong className="text-gray-700">${analysis.support.toFixed(2)}</strong></span>
            <span>Resist <strong className="text-gray-700">${analysis.resistance.toFixed(2)}</strong></span>
          </div>
        )}
      </div>

      {/* Trend indicator chips */}
      {analysis && (
        <div className="flex flex-wrap gap-2 mb-4">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
            analysis.trend === 'bullish' ? 'bg-green-50 text-green-700 border-green-200' :
            analysis.trend === 'bearish' ? 'bg-red-50 text-red-700 border-red-200' :
                                           'bg-gray-50 text-gray-600 border-gray-200'
          }`}>
            {analysis.trend === 'bullish' ? <TrendingUp size={12} /> :
             analysis.trend === 'bearish' ? <TrendingDown size={12} /> : <Minus size={12} />}
            SuperTrend: {analysis.trend.toUpperCase()}
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border bg-gray-50 text-gray-600 border-gray-200">
            Strength {analysis.trendStrength}/4
          </div>
          <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
            !analysis.indicators?.diPlus.length ? 'bg-gray-50 text-gray-400 border-gray-200' :
            (analysis.indicators.diPlus.at(-1) ?? 0) > (analysis.indicators.diMinus.at(-1) ?? 0)
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}>
            DMI
          </div>
          <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
            !analysis.indicators?.aroonOsc.length ? 'bg-gray-50 text-gray-400 border-gray-200' :
            (analysis.indicators.aroonOsc.at(-1) ?? 0) > 0
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}>
            Aroon
          </div>
          <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
            !analysis.indicators?.lrsi.length ? 'bg-gray-50 text-gray-400 border-gray-200' :
            (analysis.indicators.lrsi.at(-1) ?? 0.5) > 0.6
              ? 'bg-green-50 text-green-700 border-green-200'
              : (analysis.indicators.lrsi.at(-1) ?? 0.5) < 0.4
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-gray-50 text-gray-400 border-gray-200'
          }`}>
            LRSI
          </div>
        </div>
      )}

      {/* Overlay toggles */}
      <div className="mb-3">
        <OverlayControls
          overlays={overlays}
          onChange={(key, val) => setOverlays(prev => ({ ...prev, [key]: val }))}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
          <WifiOff size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Chart data unavailable</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* TradingView Chart */}
      <div className="rounded-xl overflow-hidden border border-gray-800 mb-6">
        <TradingViewChart
          candles={chartData?.candles ?? []}
          analysis={analysis}
          livePrice={livePrice}
          overlays={overlays}
          height={560}
        />
      </div>

      {/* Key levels grid */}
      {analysis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Support', value: `$${analysis.support.toFixed(2)}` },
            { label: 'Resistance', value: `$${analysis.resistance.toFixed(2)}` },
            { label: 'Breakout Trigger', value: `$${analysis.breakoutTrigger}` },
            { label: 'Breakdown Trigger', value: `$${analysis.breakdownTrigger}` },
            { label: 'EMA 20', value: `$${analysis.ma20}` },
            { label: 'EMA 50', value: `$${analysis.ma50}` },
            { label: 'ORB High', value: analysis.orb?.orb_high ? `$${analysis.orb.orb_high.toFixed(2)}` : '—' },
            { label: 'ORB Low', value: analysis.orb?.orb_low ? `$${analysis.orb.orb_low.toFixed(2)}` : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-100 p-3">
              <p className="text-xs text-gray-400">{label}</p>
              <p className="font-semibold text-gray-800 mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-xs text-amber-800">
        <AlertTriangle size={13} className="flex-shrink-0 mt-0.5 text-amber-600" />
        <p>
          <strong>For analysis only.</strong> Chart signals do not guarantee future performance.
          Always confirm in your broker before entering any trade.
        </p>
      </div>
    </AppShell>
  );
}

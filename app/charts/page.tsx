'use client';
import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { AlertTriangle, CandlestickChart, Monitor } from 'lucide-react';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { ChartErrorBoundary } from '@/components/charts/ChartErrorBoundary';
import { StockChartsEmbed } from '@/components/charts/StockChartsEmbed';

const SYMBOLS = ['SPY', 'QQQ', 'SQQQ', 'TQQQ', 'TSLA', 'NVDA', 'AAPL', 'MSFT', 'AMZN', 'META', 'AMD', 'PLTR'];
type ChartSource = 'tradingview' | 'stockcharts';

export default function ChartsPage() {
  const [symbol, setSymbol]           = useState('SPY');
  const [customSymbol, setCustomSymbol] = useState('');
  const [chartSource, setChartSource] = useState<ChartSource>('tradingview');

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = customSymbol.trim().toUpperCase();
    if (val) { setSymbol(val); setCustomSymbol(''); }
  };

  return (
    <AppShell title="Technical Charts">
      {/* Symbol selector */}
      <div className="flex flex-wrap gap-2 items-center mb-4">
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

        {/* Custom ticker input */}
        <form onSubmit={handleCustomSubmit} className="flex items-center gap-1">
          <input
            type="text"
            value={customSymbol}
            onChange={e => setCustomSymbol(e.target.value.toUpperCase())}
            placeholder="OTHER…"
            maxLength={10}
            className="w-20 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-300 uppercase"
          />
          <button
            type="submit"
            className="px-2.5 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Go
          </button>
        </form>

        {/* Current symbol badge (if not in list) */}
        {!SYMBOLS.includes(symbol) && (
          <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 text-white border border-purple-600">
            {symbol}
          </span>
        )}

        {/* Chart source toggle */}
        <div className="ml-auto flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setChartSource('tradingview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              chartSource === 'tradingview'
                ? 'bg-white text-purple-700 shadow-sm border border-gray-200'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <CandlestickChart size={12} />
            TradingView
          </button>
          <button
            onClick={() => setChartSource('stockcharts')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              chartSource === 'stockcharts'
                ? 'bg-white text-blue-700 shadow-sm border border-gray-200'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Monitor size={12} />
            StockCharts
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="mb-6">
        {chartSource === 'tradingview' ? (
          <ChartErrorBoundary onReset={() => setSymbol(symbol)}>
            <ChartContainer symbol={symbol} />
          </ChartErrorBoundary>
        ) : (
          <StockChartsEmbed symbol={symbol} />
        )}
      </div>

      {/* Disclaimer */}
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

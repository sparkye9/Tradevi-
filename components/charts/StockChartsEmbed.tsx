'use client';

import { useState } from 'react';
import { ExternalLink, RefreshCw, Monitor } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type SCPeriod    = 'D' | 'W' | 'M';
type SCChartType = 'c' | 'b' | 'l';  // candlestick | bar | line
type SCMonths    = '1' | '3' | '6' | '12' | '24';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUrl(symbol: string, period: SCPeriod, months: SCMonths, chartType: SCChartType): string {
  // StockCharts SharpCharts v2 embed URL
  return `https://stockcharts.com/c-sc/sc?s=${encodeURIComponent(symbol)}&p=${period}&yr=0&mn=${months}&dy=0&i=0&r=${Date.now()}&o=&l=&z=large&q=${chartType}`;
}

function openUrl(symbol: string): string {
  return `https://stockcharts.com/h-sc/ui?s=${encodeURIComponent(symbol)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface StockChartsEmbedProps {
  symbol: string;
}

export function StockChartsEmbed({ symbol }: StockChartsEmbedProps) {
  const [period, setPeriod]       = useState<SCPeriod>('D');
  const [months, setMonths]       = useState<SCMonths>('6');
  const [chartType, setChartType] = useState<SCChartType>('c');
  const [key, setKey]             = useState(0); // force iframe reload

  const src = buildUrl(symbol, period, months, chartType);

  const btnBase = 'px-2.5 py-1 text-xs rounded border font-medium transition-colors';
  const btnActive = `${btnBase} bg-purple-600 text-white border-purple-600`;
  const btnIdle   = `${btnBase} bg-white text-gray-600 border-gray-200 hover:border-purple-300`;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        {/* Branding */}
        <div className="flex items-center gap-1.5 mr-2">
          <Monitor size={13} className="text-blue-600" />
          <span className="text-xs font-semibold text-gray-700">StockCharts</span>
        </div>

        {/* Period */}
        <div className="flex gap-1">
          {(['D', 'W', 'M'] as SCPeriod[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={period === p ? btnActive : btnIdle}>
              {p === 'D' ? 'Daily' : p === 'W' ? 'Weekly' : 'Monthly'}
            </button>
          ))}
        </div>

        {/* Range */}
        <div className="flex gap-1">
          {(['1', '3', '6', '12', '24'] as SCMonths[]).map(m => (
            <button key={m} onClick={() => setMonths(m)} className={months === m ? btnActive : btnIdle}>
              {m === '1' ? '1M' : m === '3' ? '3M' : m === '6' ? '6M' : m === '12' ? '1Y' : '2Y'}
            </button>
          ))}
        </div>

        {/* Chart type */}
        <div className="flex gap-1">
          {([['c', 'Candles'], ['b', 'Bars'], ['l', 'Line']] as [SCChartType, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setChartType(t)} className={chartType === t ? btnActive : btnIdle}>
              {label}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setKey(k => k + 1)}
            className="p-1.5 rounded hover:bg-gray-200 text-gray-500 transition-colors"
            title="Reload chart"
          >
            <RefreshCw size={12} />
          </button>
          <a
            href={openUrl(symbol)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-600 text-white rounded border border-blue-600 hover:bg-blue-700 transition-colors"
          >
            Open in StockCharts <ExternalLink size={10} />
          </a>
        </div>
      </div>

      {/* Chart iframe */}
      <div className="relative w-full" style={{ paddingBottom: '56%' }}>
        <iframe
          key={`${symbol}-${period}-${months}-${chartType}-${key}`}
          src={src}
          className="absolute inset-0 w-full h-full border-0"
          title={`StockCharts: ${symbol}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>

      {/* Login hint */}
      <div className="px-4 py-2 bg-blue-50 border-t border-blue-100 flex items-center justify-between">
        <p className="text-xs text-blue-700">
          Log in to StockCharts in your browser for full account features (saved charts, ChartLists, overlays).
        </p>
        <a
          href="https://stockcharts.com/login/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:underline flex-shrink-0 ml-2"
        >
          Log in →
        </a>
      </div>
    </div>
  );
}

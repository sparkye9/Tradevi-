'use client';
import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { CandleData, StockAnalysis } from '@/lib/types';
import { format, fromUnixTime } from 'date-fns';

interface MainChartProps {
  candles: CandleData[];
  analysis: StockAnalysis | null;
  period: string;
}

export function MainChart({ candles, analysis, period }: MainChartProps) {
  const data = useMemo(() => {
    if (!candles.length) return [];
    const step = candles.length > 200 ? Math.ceil(candles.length / 200) : 1;
    return candles.filter((_, i) => i % step === 0).map(c => ({
      time: c.time,
      label: format(fromUnixTime(c.time), period === '1d' ? 'HH:mm' : 'MMM d'),
      close: c.close,
      open: c.open,
      high: c.high,
      low: c.low,
      volume: c.volume,
    }));
  }, [candles, period]);

  if (!data.length) {
    return (
      <div className="h-64 flex items-center justify-center bg-gray-50 rounded-xl animate-pulse">
        <p className="text-gray-400 text-sm">Loading chart...</p>
      </div>
    );
  }

  const prices = data.map(d => d.close);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice;
  const domain = [minPrice - priceRange * 0.05, maxPrice + priceRange * 0.05];

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: typeof data[0] }> }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
        <p className="font-medium text-gray-600 mb-1">{d.label}</p>
        <p className="text-purple-700 font-bold text-sm">${d.close.toFixed(2)}</p>
        <p className="text-gray-500">O: ${d.open.toFixed(2)} H: ${d.high.toFixed(2)} L: ${d.low.toFixed(2)}</p>
        <p className="text-gray-400">Vol: {(d.volume / 1000000).toFixed(1)}M</p>
      </div>
    );
  };

  const isUp = data[data.length - 1].close >= data[0].close;

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={isUp ? '#9333ea' : '#ef4444'} stopOpacity={0.15} />
              <stop offset="95%" stopColor={isUp ? '#9333ea' : '#ef4444'} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={domain}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${v.toFixed(0)}`}
            width={55}
          />
          <Tooltip content={<CustomTooltip />} />
          {analysis?.resistance && (
            <ReferenceLine y={analysis.resistance} stroke="#f97316" strokeDasharray="4 4" strokeWidth={1.5}
              label={{ value: 'R', position: 'right', fontSize: 10, fill: '#f97316' }} />
          )}
          {analysis?.support && (
            <ReferenceLine y={analysis.support} stroke="#22c55e" strokeDasharray="4 4" strokeWidth={1.5}
              label={{ value: 'S', position: 'right', fontSize: 10, fill: '#22c55e' }} />
          )}
          {analysis?.ma20 && (
            <ReferenceLine y={analysis.ma20} stroke="#8b5cf6" strokeDasharray="2 4" strokeWidth={1}
              label={{ value: 'MA20', position: 'right', fontSize: 9, fill: '#8b5cf6' }} />
          )}
          <Area
            type="monotone"
            dataKey="close"
            stroke={isUp ? '#9333ea' : '#ef4444'}
            strokeWidth={2}
            fill="url(#priceGrad)"
            dot={false}
            activeDot={{ r: 4, fill: isUp ? '#9333ea' : '#ef4444' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

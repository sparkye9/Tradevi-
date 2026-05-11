'use client';
import { Card, CardHeader } from '@/components/ui/Card';
import { BiasBadge, Badge } from '@/components/ui/Badge';
import type { StockAnalysis } from '@/lib/types';
import { TrendingUp } from 'lucide-react';

export function BiasCard({ analysis, symbol }: { analysis: StockAnalysis | null; symbol: string }) {
  if (!analysis) {
    return (
      <Card>
        <CardHeader title="Market Bias" icon={<TrendingUp size={16} />} />
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-gray-100 rounded" />
          <div className="h-4 bg-gray-100 rounded w-3/4" />
        </div>
      </Card>
    );
  }

  const { bias, rsi, trend, trendStrength, atr, price } = analysis;
  const atrPct = price > 0 ? ((atr / price) * 100).toFixed(1) : '0';

  return (
    <Card>
      <CardHeader
        title={`${symbol} Bias`}
        icon={<TrendingUp size={16} />}
        action={<BiasBadge bias={bias} />}
      />
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Trend</span>
          <span className={`font-medium capitalize ${trend === 'bullish' ? 'text-green-700' : trend === 'bearish' ? 'text-red-700' : 'text-gray-700'}`}>
            {trend}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">RSI (14)</span>
          <span className={`font-medium ${rsi > 70 ? 'text-red-600' : rsi < 30 ? 'text-green-600' : 'text-gray-800'}`}>
            {rsi.toFixed(1)}
            {rsi > 70 ? ' Overbought' : rsi < 30 ? ' Oversold' : ''}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">ATR</span>
          <span className="font-medium text-gray-800">${atr.toFixed(2)} ({atrPct}%)</span>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Trend Strength</span>
            <span>{trendStrength}/100</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${trend === 'bullish' ? 'bg-green-500' : trend === 'bearish' ? 'bg-red-500' : 'bg-gray-400'}`}
              style={{ width: `${trendStrength}%` }}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

import { Card, CardHeader } from '@/components/ui/Card';
import type { StockAnalysis } from '@/lib/types';
import { ArrowUp, ArrowDown, Target } from 'lucide-react';

export function KeyLevels({ analysis }: { analysis: StockAnalysis | null }) {
  if (!analysis) return (
    <Card>
      <CardHeader title="Key Levels" />
      <div className="animate-pulse space-y-2">
        {[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded" />)}
      </div>
    </Card>
  );

  const { price, resistance, support, keyLevelAbove, keyLevelBelow, breakoutTrigger, breakdownTrigger, ma20, ma50 } = analysis;
  const levels = [
    { label: 'Breakout Trigger', value: breakoutTrigger, icon: <ArrowUp size={12} />, color: 'text-green-600 bg-green-50', diff: ((breakoutTrigger - price) / price * 100) },
    { label: 'Resistance', value: resistance, icon: <Target size={12} />, color: 'text-orange-600 bg-orange-50', diff: ((resistance - price) / price * 100) },
    { label: 'Key Level ↑', value: keyLevelAbove, icon: <ArrowUp size={12} />, color: 'text-blue-600 bg-blue-50', diff: ((keyLevelAbove - price) / price * 100) },
    { label: '─ Current Price', value: price, icon: null, color: 'text-purple-700 bg-purple-50 font-bold', diff: 0 },
    { label: 'Key Level ↓', value: keyLevelBelow, icon: <ArrowDown size={12} />, color: 'text-blue-600 bg-blue-50', diff: ((keyLevelBelow - price) / price * 100) },
    { label: 'Support', value: support, icon: <Target size={12} />, color: 'text-orange-600 bg-orange-50', diff: ((support - price) / price * 100) },
    { label: 'Breakdown Trigger', value: breakdownTrigger, icon: <ArrowDown size={12} />, color: 'text-red-600 bg-red-50', diff: ((breakdownTrigger - price) / price * 100) },
  ].filter(l => l.value > 0).sort((a, b) => b.value - a.value);

  return (
    <Card>
      <CardHeader title="Key Levels" icon={<Target size={16} />} />
      <div className="space-y-1.5">
        {levels.map(({ label, value, icon, color, diff }) => (
          <div key={label} className={`flex items-center justify-between px-3 py-1.5 rounded-lg ${color}`}>
            <div className="flex items-center gap-1.5 text-xs font-medium">
              {icon}
              {label}
            </div>
            <div className="text-right">
              <span className="text-sm font-bold">${value.toFixed(2)}</span>
              {diff !== 0 && (
                <span className="ml-1 text-xs opacity-70">
                  {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-50 rounded p-2">
          <span className="text-gray-500">MA20</span>
          <span className="float-right font-medium">${ma20.toFixed(2)}</span>
        </div>
        <div className="bg-gray-50 rounded p-2">
          <span className="text-gray-500">MA50</span>
          <span className="float-right font-medium">${ma50.toFixed(2)}</span>
        </div>
      </div>
    </Card>
  );
}

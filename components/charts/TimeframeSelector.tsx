'use client';
import type { Timeframe } from './chartTypes';

const TIMEFRAMES: { value: Timeframe; label: string; tip: string }[] = [
  { value: '1m',  label: '1m',  tip: '1 minute — intraday scalping' },
  { value: '5m',  label: '5m',  tip: '5 minutes — day trading' },
  { value: '15m', label: '15m', tip: '15 minutes — day trading' },
  { value: '1H',  label: '1H',  tip: '1 hour — swing/day hybrid' },
  { value: '4H',  label: '4H',  tip: '4 hours — swing trading (uses 1H candles)' },
  { value: '1D',  label: '1D',  tip: 'Daily — swing/position trading' },
  { value: '1W',  label: '1W',  tip: 'Weekly — long-term positioning' },
];

interface Props {
  value: Timeframe;
  onChange: (tf: Timeframe) => void;
  disabled?: boolean;
}

export function TimeframeSelector({ value, onChange, disabled }: Props) {
  return (
    <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5" role="group" aria-label="Timeframe">
      {TIMEFRAMES.map(tf => (
        <button
          key={tf.value}
          title={tf.tip}
          disabled={disabled}
          onClick={() => onChange(tf.value)}
          className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all disabled:opacity-50 ${
            value === tf.value
              ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
              : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'
          }`}
        >
          {tf.label}
        </button>
      ))}
    </div>
  );
}

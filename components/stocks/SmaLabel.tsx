import type { FinvizQuote } from '@/lib/finviz';

export default function SmaLabel({ q }: { q: FinvizQuote }) {
  const fmt = (rel: 'above' | 'below' | null, label: string) => {
    if (rel === 'above')
      return (
        <span key={label} className="text-emerald-400">
          {label}▲
        </span>
      );
    if (rel === 'below')
      return (
        <span key={label} className="text-red-400">
          {label}▼
        </span>
      );
    return (
      <span key={label} className="text-gray-600">
        {label}?
      </span>
    );
  };
  return (
    <div className="flex gap-1 text-xs font-mono">
      {fmt(q.sma20rel, '20')}
      {fmt(q.sma50rel, '50')}
      {fmt(q.sma200rel, '200')}
    </div>
  );
}

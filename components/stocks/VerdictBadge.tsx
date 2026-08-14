import type { StockQuality } from '@/lib/stockQuality';

export default function VerdictBadge({ quality }: { quality: StockQuality }) {
  if (quality.label === 'NO_TRADE') {
    return (
      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide bg-gray-500/15 text-gray-400 border border-gray-500/30">
        NO TRADE
      </span>
    );
  }
  const long = quality.side === 'long';
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide border ${
        long
          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
          : 'bg-red-500/15 text-red-300 border-red-500/30'
      }`}
    >
      {long ? 'LOOK LONG' : 'LOOK SHORT'} · {quality.score}
    </span>
  );
}

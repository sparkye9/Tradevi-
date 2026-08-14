'use client';

interface Props {
  symbol: string;
  label?: string;
}

export default function TradingViewButton({ symbol, label }: Props) {
  const url = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#141414] border border-[#2a2a2a] text-gray-200 hover:text-white hover:border-emerald-500/40 hover:bg-emerald-500/10 transition-colors"
    >
      <span className="text-emerald-400" aria-hidden>
        ↗
      </span>
      {label ?? `Confirm ${symbol} on TradingView`}
    </a>
  );
}

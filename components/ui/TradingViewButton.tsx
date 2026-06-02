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
      className="inline-flex items-center gap-1 px-3 py-1 rounded text-xs bg-[#1a1a1a] border border-[#2a2a2a] text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
    >
      <span className="text-blue-400">&#x2197;</span>
      {label ?? `Chart ${symbol}`}
    </a>
  );
}

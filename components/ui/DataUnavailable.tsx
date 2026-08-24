'use client';

interface Props {
  symbol?: string;
  reason?: string;
  href?: string;
  linkLabel?: string;
}

export default function DataUnavailable({ symbol, reason, href, linkLabel }: Props) {
  const link = href ?? (symbol ? `https://finviz.com/quote.ashx?t=${encodeURIComponent(symbol)}` : 'https://finviz.com');
  const label = linkLabel ?? (symbol ? `View ${symbol} on Finviz` : href ? 'Open source' : undefined);

  return (
    <div className="flex items-start gap-2 p-3 rounded bg-[#1a1a1a] border border-[#2a2a2a]">
      <span className="text-yellow-500 mt-0.5">!</span>
      <div className="text-sm">
        <span className="text-gray-300">Not available -- verify manually.</span>
        {reason && <span className="text-gray-500 ml-1">({reason})</span>}
        {(symbol || href) && label && (
          <>
            {' '}
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 underline hover:text-blue-300"
            >
              {label}
            </a>
          </>
        )}
      </div>
    </div>
  );
}

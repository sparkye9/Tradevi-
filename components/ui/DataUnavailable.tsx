'use client';
import { friendlyDataError } from '@/lib/friendlyError';

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
    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-tv-amber/5 border border-tv-amber/20">
      <span className="text-tv-amber mt-0.5 text-sm">ⓘ</span>
      <div className="text-sm">
        <span className="text-gray-300">{friendlyDataError(reason)}</span>
        {(symbol || href) && label && (
          <>
            {' '}
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-tv-purple underline hover:text-white"
            >
              {label}
            </a>
          </>
        )}
        {reason && (
          <details className="mt-1">
            <summary className="cursor-pointer text-[11px] text-gray-600 hover:text-gray-400 select-none">
              Technical details
            </summary>
            <p className="text-[11px] text-gray-600 font-mono mt-1 break-words">{reason}</p>
          </details>
        )}
      </div>
    </div>
  );
}

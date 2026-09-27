import Link from 'next/link';
import type { ReactNode } from 'react';

interface Props {
  /** One-line summary shown on the collapsed bar. */
  summary: string;
  items: { term?: string; text: ReactNode }[];
  /** Optional deeper lesson on the Learn page. */
  learnHref?: string;
  learnLabel?: string;
}

/**
 * Collapsible plain-English explainer for the top of each desk, so students
 * know what the page is showing before the jargon hits.
 */
export default function LearnBox({ summary, items, learnHref, learnLabel = 'Go deeper in Learn →' }: Props) {
  return (
    <details className="group rounded-2xl border border-tv-purple/25 bg-tv-purple/[0.06] px-4 py-3">
      <summary className="cursor-pointer select-none list-none flex items-center gap-2 text-sm">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-tv-purple/20 text-tv-purple text-xs font-bold">
          ?
        </span>
        <span className="font-semibold text-white">What am I looking at?</span>
        <span className="text-tv-muted hidden sm:inline">— {summary}</span>
        <span className="ml-auto text-tv-purple text-xs group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="mt-3 space-y-2">
        <p className="text-xs text-tv-muted sm:hidden">{summary}</p>
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="text-xs text-gray-300 leading-relaxed">
              {item.term && <span className="font-mono font-bold text-white">{item.term}</span>}
              {item.term && <span className="text-tv-muted"> — </span>}
              {item.text}
            </li>
          ))}
        </ul>
        {learnHref && (
          <Link href={learnHref} className="inline-block text-xs font-semibold text-tv-purple hover:text-white pt-1">
            {learnLabel}
          </Link>
        )}
      </div>
    </details>
  );
}

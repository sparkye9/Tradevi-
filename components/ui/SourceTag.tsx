'use client';

interface Props {
  source: string;
  lastUpdated: string; // ISO string
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export default function SourceTag({ source, lastUpdated }: Props) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-[#1a1a1a] border border-[#2a2a2a] px-2 py-0.5 rounded">
      <span className="text-gray-400">Source:</span>
      <span>{source}</span>
      <span className="text-gray-600">|</span>
      <span>updated {fmtTime(lastUpdated)}</span>
    </span>
  );
}

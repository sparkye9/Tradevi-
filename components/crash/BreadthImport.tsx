'use client';
import { useRef, useState } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import { IMPORT_TARGETS, importedSeries, parseTradingViewCsv } from '@/lib/crash/tradingviewCsv';
import type { LevelSeries } from '@/lib/crash/series';

const KEY = 'tradevi.crash.imports.v1';

export function loadImports(): LevelSeries[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function saveImports(list: LevelSeries[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage blocked — the import still applies for this visit */
  }
}

/**
 * Manual TradingView CSV import for breadth series. TradingView has no data
 * API and forbids scraping, so this is the supported route: export the chart
 * (e.g. INDEX:S5FI) from TradingView and load the file here. The file is
 * parsed in the browser and kept in this browser only.
 */
export default function BreadthImport({ imports, onChange }: { imports: LevelSeries[]; onChange: (list: LevelSeries[]) => void }) {
  const [target, setTarget] = useState(IMPORT_TARGETS[1].id);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    setError(null);
    try {
      if (file.size > 2_000_000) throw new Error('File is larger than 2 MB.');
      const pts = parseTradingViewCsv(await file.text());
      const s = importedSeries(target, pts, file.name.slice(0, 60), new Date().toISOString());
      const next = [...imports.filter((x) => x.meta.id !== target), s];
      saveImports(next);
      onChange(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (input.current) input.current.value = '';
    }
  }

  function remove(id: string) {
    const next = imports.filter((x) => x.meta.id !== id);
    saveImports(next);
    onChange(next);
  }

  return (
    <div className="card space-y-3">
      <div>
        <h3 className="text-sm font-bold text-white">Import breadth from TradingView</h3>
        <p className="text-xs text-tv-muted mt-1">
          TradingView has no data API, so Tradevi can&apos;t read it directly. On a TradingView chart of a breadth symbol (for example{' '}
          <span className="font-mono text-gray-300">INDEX:S5FI</span> for % of S&amp;P 500 stocks above their 50-day), use <em>Export chart data</em> and load the CSV here.
          It stays in this browser. You can also send a daily TradingView alert to Tradevi&apos;s webhook; see the methodology doc.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className="input text-xs" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Series this file contains">
          {IMPORT_TARGETS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <label className="btn btn-primary text-xs cursor-pointer inline-flex items-center gap-1.5">
          <Upload size={14} /> Choose CSV
          <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
      </div>
      {error && <p className="text-xs text-tv-red">{error}</p>}
      {imports.length > 0 && (
        <ul className="space-y-1">
          {imports.map((s) => (
            <li key={s.meta.id} className="flex items-center justify-between gap-2 text-xs bg-white/[0.03] rounded-lg px-2 py-1.5">
              <span className="text-gray-300">
                {s.meta.label} · <span className="text-tv-muted">{s.points.length} days, last {s.points[s.points.length - 1]?.date} · {s.meta.source}</span>
              </span>
              <button className="text-tv-muted hover:text-tv-red" aria-label={`Remove ${s.meta.label}`} onClick={() => remove(s.meta.id)}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

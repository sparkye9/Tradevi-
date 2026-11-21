'use client';
/** Saved runs (browser), export / import, reproduce-and-verify, data validation and the acceptance checklist. */
import { useEffect, useRef, useState } from 'react';
import { compareManifests, type ReproCheck, type RunManifest } from '@/lib/crash/history/manifest';
import { Pill, SectionTitle, fmtDate } from '../ui';
import { download, historyPost, storageGet, storageSet, type StatusData } from './api';

export interface SavedRun {
  id: string;
  name: string;
  savedAt: string;
  action: 'evaluate' | 'lab' | 'trade';
  params: Record<string, unknown>;
  manifest: RunManifest;
  summary: string;
}

const RUNS_KEY = 'tradevi.crash.sim.runs.v1';

export function saveRun(r: SavedRun) {
  const list = storageGet<SavedRun[]>(RUNS_KEY, []);
  storageSet(RUNS_KEY, [r, ...list].slice(0, 30));
}

export default function RunsPanel({ status, criteria, onLoad }: { status: StatusData | null; criteria: { n: number; text: string; state: 'met' | 'theoretical' | 'unmet'; note: string }[]; onLoad: (r: SavedRun) => void }) {
  const [runs, setRuns] = useState<SavedRun[]>([]);
  const [checks, setChecks] = useState<Record<string, ReproCheck | string>>({});
  const file = useRef<HTMLInputElement>(null);
  const refresh = () => setRuns(storageGet<SavedRun[]>(RUNS_KEY, []));
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, []);

  async function rerun(r: SavedRun) {
    setChecks((c) => ({ ...c, [r.id]: 'Re-running…' }));
    try {
      const out = await historyPost<{ manifest: RunManifest }>({ action: r.action, ...r.params });
      setChecks((c) => ({ ...c, [r.id]: compareManifests(r.manifest, out.manifest) }));
    } catch (e) {
      setChecks((c) => ({ ...c, [r.id]: e instanceof Error ? e.message : String(e) }));
    }
  }
  function remove(id: string) {
    const next = runs.filter((r) => r.id !== id);
    storageSet(RUNS_KEY, next);
    setRuns(next);
  }
  async function importFile(f: File) {
    try {
      const parsed = JSON.parse(await f.text());
      const list = (Array.isArray(parsed) ? parsed : [parsed]).filter((x) => x && x.manifest && x.params && x.action) as SavedRun[];
      const next = [...list, ...runs].slice(0, 30);
      storageSet(RUNS_KEY, next);
      setRuns(next);
    } catch {
      alertless('That file is not a Tradevi simulation export.');
    }
  }
  const [msg, setMsg] = useState<string | null>(null);
  function alertless(m: string) {
    setMsg(m);
    setTimeout(() => setMsg(null), 4000);
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <SectionTitle
          title="Saved runs and reproducibility"
          subtitle="Each run stores its parameters, data sources, date range, execution assumptions, results fingerprint and engine version. Saved in this browser; export to keep or share."
          right={
            <div className="flex gap-1.5">
              <button className="btn text-xs" disabled={!runs.length} onClick={() => download('tradevi-simulations.json', JSON.stringify(runs, null, 2))}>Export all</button>
              <button className="btn text-xs" onClick={() => file.current?.click()}>Import</button>
              <input ref={file} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
            </div>
          }
        />
        {msg && <p className="text-xs text-tv-amber mb-2">{msg}</p>}
        {!runs.length ? (
          <p className="text-sm text-tv-muted">No saved runs yet. Run the performance report, the lab or a trade, then press Save.</p>
        ) : (
          <div className="space-y-2">
            {runs.map((r) => {
              const c = checks[r.id];
              return (
                <div key={r.id} className="rounded-xl border border-tv-border p-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold text-white">{r.name}</span> <span className="text-tv-muted">· {r.action} · {new Date(r.savedAt).toLocaleString()} · {r.manifest.engineVersion} · data {r.manifest.datasetHash} · {r.manifest.range.from} → {r.manifest.range.to} · options {r.manifest.options.kind}</span>
                      <div className="text-tv-muted">{r.summary}</div>
                    </div>
                    <div className="flex gap-1.5">
                      <button className="btn text-xs" onClick={() => onLoad(r)}>Load</button>
                      <button className="btn text-xs" onClick={() => rerun(r)}>Re-run and verify</button>
                      <button className="btn text-xs" onClick={() => download(`tradevi-run-${r.id}.json`, JSON.stringify(r, null, 2))}>Export</button>
                      <button className="btn text-xs" onClick={() => remove(r.id)}>Delete</button>
                    </div>
                  </div>
                  {typeof c === 'string' && <div className="mt-1 text-tv-muted">{c}</div>}
                  {c && typeof c !== 'string' && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Pill tone={c.sameData ? 'green' : 'amber'}>{c.sameData ? 'Same input data' : `Data changed: ${c.changedSeries.slice(0, 6).join(', ')}`}</Pill>
                      <Pill tone={c.sameEngine ? 'green' : 'amber'}>{c.sameEngine ? 'Same engine version' : 'Engine version changed'}</Pill>
                      {c.sameResult != null && <Pill tone={c.sameResult ? 'green' : 'red'}>{c.sameResult ? 'Identical results' : 'Results differ'}</Pill>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card p-4">
        <SectionTitle title="Data validation" subtitle={status ? `Full-history dataset built ${new Date(status.builtAt).toLocaleString()} · ${status.sessions.toLocaleString()} sessions, ${fmtDate(status.firstSession)} – ${fmtDate(status.lastSession)}` : 'Loading…'} />
        {status && (
          <div className="grid lg:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-tv-muted mb-1">Checks: duplicates, order, gaps, impossible prices, likely unadjusted splits, revisable data without vintages</div>
              {status.validation.length === 0 ? <p className="text-tv-green">No issues found.</p> : (
                <ul className="space-y-0.5">{status.validation.map((v, i) => <li key={i} className="flex justify-between gap-2"><span><b className="text-white">{v.id}</b> {v.issue}{v.example ? ` (${v.example})` : ''}</span><span className="font-mono">{v.count}</span></li>)}</ul>
              )}
              {status.errors.length > 0 && <div className="mt-2 text-tv-amber">Unavailable: {status.errors.map((e) => e.id).join(', ')}</div>}
              <div className="mt-3 text-tv-muted">Survivorship: the simulator uses index and sector ETFs that still trade, not today's index members applied to the past; single stocks are not included. Splits: ETF prices are split-adjusted; option strikes are never dividend-adjusted. Adjusted option contracts (non-standard deliverables) are rejected on import.</div>
            </div>
            <div className="overflow-x-auto max-h-72">
              <table className="w-full">
                <thead className="text-tv-muted text-left"><tr><th className="py-1 pr-2">Series</th><th className="pr-2">Source</th><th className="pr-2">From</th><th className="pr-2">To</th><th>Point-in-time</th></tr></thead>
                <tbody>
                  {status.series.map((s) => (
                    <tr key={s.id} className="border-t border-white/[0.04]">
                      <td className="py-0.5 pr-2 text-white">{s.id}</td><td className="pr-2 text-tv-muted">{s.source}</td><td className="pr-2">{s.first}</td><td className="pr-2">{s.last}</td>
                      <td>{s.revisable && !s.vintage ? <Pill tone="amber">revised values</Pill> : s.vintage ? <Pill tone="green">first release</Pill> : <Pill tone="gray">not revised</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="lg:col-span-2">
              <div className="text-tv-muted mb-1">Historical option chains loaded</div>
              <div className="flex flex-wrap gap-1.5">
                {status.options.map((o) => <Pill key={o.symbol} tone={o.dates ? 'green' : 'gray'}>{o.symbol}: {o.dates ? `${o.dates} days, ${o.first} – ${o.last}` : 'none'}</Pill>)}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card p-4">
        <SectionTitle title="Acceptance criteria" subtitle="Criteria that need actual historical options data stay unmet until such data is loaded; theoretical results never satisfy them." />
        <ol className="space-y-1 text-xs">
          {criteria.map((c) => (
            <li key={c.n} className="flex gap-2">
              <span className="w-5 text-tv-muted">{c.n}.</span>
              <Pill tone={c.state === 'met' ? 'green' : c.state === 'theoretical' ? 'amber' : 'red'}>{c.state === 'met' ? 'MET' : c.state === 'theoretical' ? 'THEORETICAL ONLY' : 'UNMET'}</Pill>
              <span className="text-gray-300">{c.text}</span>
              <span className="text-tv-muted">{c.note}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

'use client';
import { useMemo, useRef, useState } from 'react';
import ClientOnly from '@/components/ClientOnly';
import { NumberField, TextField, Stat, Notice, usd } from '@/components/ui/Form';
import { useWorkspaceStore, type JournalEntry } from '@/store/workspaceStore';
import { usePropFirmStore } from '@/store/propFirmStore';
import { cmeSessionDate } from '@/lib/propFirm';
import { statsFor } from '@/lib/backtest';

const MAX_SHOTS = 3;
/** Rough ceiling for screenshots in localStorage (browsers allow ~5 MB per site). */
const SHOT_BUDGET_BYTES = 3_000_000;

/** Downscale an image file to a JPEG data URL no wider than `maxW`. */
async function shrink(file: File, maxW = 900): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('not an image'));
      i.src = url;
    });
    const scale = Math.min(1, maxW / img.width);
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const blank = (): Omit<JournalEntry, 'id' | 'createdAt'> => ({
  date: cmeSessionDate(new Date()), instrument: 'MNQ', direction: 'long', contracts: 1, entry: null, exit: null, stop: null, pnl: null,
  setupType: '', entryReason: '', exitReason: '', followedRules: true, mistakes: '', lessons: '', screenshots: [], accountId: null,
});

function JournalForm({ onSaved }: { onSaved: () => void }) {
  const { addJournal, journal } = useWorkspaceStore();
  const accounts = usePropFirmStore((s) => s.accounts);
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const usedBytes = useMemo(() => journal.reduce((s, j) => s + j.screenshots.reduce((a, x) => a + x.length, 0), 0), [journal]);

  async function addShots(files: FileList | null) {
    if (!files) return;
    const room = MAX_SHOTS - f.screenshots.length;
    const out: string[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      try { out.push(await shrink(file)); } catch { setMsg(`${file.name} is not an image.`); }
    }
    const added = out.reduce((a, x) => a + x.length, 0);
    if (usedBytes + added > SHOT_BUDGET_BYTES) return setMsg('Screenshot storage is full in this browser. Delete old screenshots or keep images elsewhere and paste a link in the notes.');
    set('screenshots', [...f.screenshots, ...out]);
  }

  return (
    <section className="card space-y-3">
      <h2 className="text-sm font-bold text-white">New trade</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <TextField label="Date" type="date" value={f.date} onChange={(v) => set('date', v)} />
        <TextField label="Instrument" value={f.instrument} onChange={(v) => set('instrument', v.toUpperCase().slice(0, 12))} />
        <label className="block space-y-1"><span className="label">Direction</span>
          <select className="input font-sans" value={f.direction} onChange={(e) => set('direction', e.target.value as 'long' | 'short')}><option value="long">Long</option><option value="short">Short</option></select>
        </label>
        <NumberField label="Contracts" value={f.contracts} step={1} onChange={(v) => set('contracts', Math.max(0, Math.round(v ?? 0)))} />
        <NumberField label="Entry" value={f.entry} onChange={(v) => set('entry', v)} />
        <NumberField label="Stop" value={f.stop} onChange={(v) => set('stop', v)} />
        <NumberField label="Exit" value={f.exit} onChange={(v) => set('exit', v)} />
        <NumberField label="Net P&L" suffix="$" value={f.pnl} onChange={(v) => set('pnl', v)} hint="after fees, from your platform" />
        <TextField label="Setup type" value={f.setupType} onChange={(v) => set('setupType', v)} placeholder="Pullback, Power Hour…" />
        {accounts.length > 0 && (
          <label className="block space-y-1"><span className="label">Account</span>
            <select className="input font-sans" value={f.accountId ?? ''} onChange={(e) => set('accountId', e.target.value || null)}>
              <option value="">—</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 text-xs text-gray-300 pt-5"><input type="checkbox" checked={f.followedRules} onChange={(e) => set('followedRules', e.target.checked)} />Followed my rules</label>
      </div>
      {(['entryReason', 'exitReason', 'mistakes', 'lessons'] as const).map((k) => (
        <label key={k} className="block space-y-1">
          <span className="label">{{ entryReason: 'Entry reasoning', exitReason: 'Exit reasoning', mistakes: 'Mistakes', lessons: 'Lessons learned' }[k]}</span>
          <textarea className="input font-sans min-h-[56px]" value={f[k]} onChange={(e) => set(k, e.target.value.slice(0, 4000))} />
        </label>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={f.screenshots.length >= MAX_SHOTS}>Add screenshot ({f.screenshots.length}/{MAX_SHOTS})</button>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addShots(e.target.files); e.target.value = ''; }} />
        {f.screenshots.map((s, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={s} alt={`screenshot ${i + 1}`} className="h-12 rounded border border-tv-border cursor-pointer" onClick={() => set('screenshots', f.screenshots.filter((_, x) => x !== i))} title="Click to remove" />
        ))}
      </div>
      {msg && <p className="text-xs text-tv-amber">{msg}</p>}
      <button className="btn btn-primary" onClick={() => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date) || !f.instrument) return setMsg('Date and instrument are required.');
        addJournal(f);
        setF(blank());
        setMsg('');
        onSaved();
      }}>Save trade</button>
    </section>
  );
}

function Journal() {
  const { journal, removeJournal } = useWorkspaceStore();
  const [adding, setAdding] = useState(false);
  const withPnl = journal.filter((j) => j.pnl != null);
  // R multiple when entry and stop are known.
  const rs = journal
    .filter((j) => j.entry != null && j.stop != null && j.exit != null && j.entry !== j.stop)
    .map((j) => ((j.direction === 'long' ? j.exit! - j.entry! : j.entry! - j.exit!) / Math.abs(j.entry! - j.stop!)));
  const st = statsFor('Journal', rs);
  const net = withPnl.reduce((s, j) => s + (j.pnl ?? 0), 0);
  const ruleRate = journal.length ? Math.round((journal.filter((j) => j.followedRules).length / journal.length) * 100) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Stat label="Trades logged" value={journal.length} />
        <Stat label="Net P&L (entered)" value={usd(net)} tone={net >= 0 ? 'good' : 'bad'} sub={`${withPnl.length} with P&L`} />
        <Stat label="Win rate (by R)" value={rs.length ? `${st.winRate}%` : '—'} sub={`${rs.length} with entry/stop/exit`} />
        <Stat label="Expectancy" value={rs.length ? `${st.expectancyR}R` : '—'} />
        <Stat label="Rule compliance" value={ruleRate == null ? '—' : `${ruleRate}%`} tone={ruleRate != null && ruleRate < 80 ? 'warn' : undefined} />
      </div>
      {rs.length > 0 && rs.length < 30 && <Notice tone="info">{rs.length} trades with full prices — too few for the win rate or expectancy to mean much yet.</Notice>}
      {!adding ? <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Log a trade</button> : <JournalForm onSaved={() => setAdding(false)} />}
      <div className="space-y-2">
        {journal.map((j) => (
          <details key={j.id} className="card">
            <summary className="cursor-pointer flex flex-wrap items-center gap-3 text-sm">
              <span className="font-mono text-gray-400">{j.date}</span>
              <span className="font-mono font-bold text-white">{j.instrument}</span>
              <span className={j.direction === 'long' ? 'text-tv-green' : 'text-tv-red'}>{j.direction}</span>
              <span className="text-gray-500">{j.setupType}</span>
              <span className={`ml-auto font-mono ${(j.pnl ?? 0) >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>{j.pnl != null ? usd(j.pnl) : ''}</span>
              {!j.followedRules && <span className="pill border-tv-amber/50 text-tv-amber">rule break</span>}
            </summary>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-300">
              <p><b className="text-gray-500">Prices</b> entry {j.entry ?? '—'} · stop {j.stop ?? '—'} · exit {j.exit ?? '—'} · {j.contracts} ct</p>
              {j.entryReason && <p><b className="text-gray-500">Entry:</b> {j.entryReason}</p>}
              {j.exitReason && <p><b className="text-gray-500">Exit:</b> {j.exitReason}</p>}
              {j.mistakes && <p><b className="text-gray-500">Mistakes:</b> {j.mistakes}</p>}
              {j.lessons && <p><b className="text-gray-500">Lessons:</b> {j.lessons}</p>}
              <div className="flex gap-2 flex-wrap">{j.screenshots.map((s, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <a key={i} href={s} target="_blank" rel="noreferrer"><img src={s} alt={`screenshot ${i + 1}`} className="h-24 rounded border border-tv-border" /></a>
              ))}</div>
            </div>
            <button className="mt-2 text-[10px] text-gray-600 hover:text-tv-red" onClick={() => { if (confirm('Delete this journal entry?')) removeJournal(j.id); }}>Delete</button>
          </details>
        ))}
      </div>
    </div>
  );
}

export default function JournalPage() {
  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Trading Journal</h1>
        <p className="text-sm text-gray-500 mt-1">Log each trade with your reasoning, rule compliance and lessons. Stored in this browser only — nothing is uploaded.</p>
      </div>
      <ClientOnly fallback={<div className="h-40 skeleton" />}><Journal /></ClientOnly>
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import ClientOnly from '@/components/ClientOnly';
import { Notice } from '@/components/ui/Form';
import { useWorkspaceStore, DEFAULT_PH_ENTRY, DEFAULT_PH_EXIT } from '@/store/workspaceStore';

const LOCAL_KEYS = [
  { key: 'tradevi-propfirm', label: 'Prop firm accounts, rules and daily logs' },
  { key: 'tradevi-workspace', label: 'Checklists, Power Hour window, journal (incl. screenshots)' },
  { key: 'tradevi-store', label: 'Stock watchlist and scan settings' },
];

function bytes(key: string): number {
  try { return (localStorage.getItem(key) ?? '').length; } catch { return 0; }
}

function SettingsBody() {
  const { phEntry, phExit, setPowerHour } = useWorkspaceStore();
  const [entry, setEntry] = useState(phEntry);
  const [exit, setExit] = useState(phExit);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [, force] = useState(0);
  useEffect(() => { fetch('/api/health').then((r) => r.json()).then(setHealth).catch(() => setHealth(null)); }, []);
  const ok = /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/;

  function exportAll() {
    const data: Record<string, unknown> = {};
    for (const { key } of LOCAL_KEYS) {
      try { const v = localStorage.getItem(key); if (v) data[key] = JSON.parse(v); } catch { /* skip unreadable */ }
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `tradevi-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <h2 className="text-sm font-bold text-white">Power Hour window (ET)</h2>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="space-y-1"><span className="label">Entry observation</span><input className="input w-36" value={entry} onChange={(e) => setEntry(e.target.value)} /></label>
          <label className="space-y-1"><span className="label">Exit planning</span><input className="input w-36" value={exit} onChange={(e) => setExit(e.target.value)} /></label>
          <button className="btn btn-primary" disabled={!ok.test(entry) || !ok.test(exit)} onClick={() => setPowerHour({ phEntry: entry, phExit: exit })}>Save</button>
          <button className="btn" onClick={() => { setEntry(DEFAULT_PH_ENTRY); setExit(DEFAULT_PH_EXIT); setPowerHour({ phEntry: DEFAULT_PH_ENTRY, phExit: DEFAULT_PH_EXIT }); }}>Reset to 14:38–14:45 / 15:15–15:20</button>
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="text-sm font-bold text-white">Data stored in this browser</h2>
        <p className="text-xs text-gray-500">Tradevi has no user accounts. Everything you enter stays in this browser&apos;s local storage — clearing site data or switching devices loses it. Export a backup regularly.</p>
        {LOCAL_KEYS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2 text-xs">
            <span className="text-gray-300 flex-1">{label}</span>
            <span className="font-mono text-gray-500">{(bytes(key) / 1024).toFixed(1)} KB</span>
            <button className="text-gray-600 hover:text-tv-red" onClick={() => { if (confirm(`Delete "${label}" from this browser? This cannot be undone.`)) { try { localStorage.removeItem(key); } catch { /* ignore */ } force((n) => n + 1); location.reload(); } }}>Clear</button>
          </div>
        ))}
        <button className="btn" onClick={exportAll}>Export everything (JSON)</button>
      </section>

      <section className="card space-y-2">
        <h2 className="text-sm font-bold text-white">Data providers</h2>
        <ul className="text-xs text-gray-400 space-y-1">
          <li><b className="text-gray-200">Futures bars and quotes:</b> Yahoo Finance continuous front-month (delayed, unofficial). Micro contracts read the full-size series.</li>
          <li><b className="text-gray-200">Daily fallback:</b> Stooq end-of-day CSV.</li>
          <li><b className="text-gray-200">Economic calendar:</b> Forex Factory weekly export.</li>
          <li><b className="text-gray-200">Stocks / options:</b> Finviz and Yahoo; Tradier real-time when configured.</li>
        </ul>
        {health ? (
          <p className="text-xs font-mono text-gray-500">Configured: Tradier {String(health.tradier)} · Finviz {String(health.finviz)} · TradingView webhook {String(health.tradingviewWebhook)} · Supabase {String(health.supabase)}</p>
        ) : <Notice>Could not read /api/health.</Notice>}
      </section>

      <Notice tone="info">Tradevi never places orders and has no broker connection. Automated execution is out of scope.</Notice>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-5 max-w-3xl">
      <h1 className="text-2xl font-bold text-white">Settings</h1>
      <ClientOnly fallback={<div className="h-40 skeleton" />}><SettingsBody /></ClientOnly>
    </div>
  );
}

'use client';
import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useJournalStore } from '@/store/journalStore';
import { useAuditStore } from '@/store/auditStore';
import type { JournalEntry } from '@/lib/types';
import { BookOpen, Plus, X, TrendingUp, TrendingDown } from 'lucide-react';

const EMOTIONS = ['Confident', 'Anxious', 'FOMO', 'Greedy', 'Calm', 'Frustrated', 'Disciplined', 'Impulsive'];

function JournalCard({ entry }: { entry: JournalEntry }) {
  const { closeEntry, removeEntry } = useJournalStore();
  const log = useAuditStore(s => s.log);
  const [closing, setClosing] = useState(false);
  const [exitPrice, setExitPrice] = useState('');
  const [lesson, setLesson] = useState('');

  const handleClose = () => {
    if (!exitPrice) return;
    closeEntry(entry.id, Number(exitPrice), lesson);
    log('Journal Entry Closed', `Closed ${entry.ticker} @ $${exitPrice}`, 'journal', entry.ticker);
    setClosing(false);
  };

  const pnl = entry.profitLoss ?? null;
  const isWin = pnl != null && pnl > 0;

  return (
    <Card className={entry.status === 'closed' ? 'opacity-90' : ''}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900">{entry.ticker}</span>
            <Badge variant={entry.status === 'open' ? 'info' : isWin ? 'success' : 'danger'}>
              {entry.status === 'open' ? 'Open' : isWin ? `+$${pnl?.toFixed(0)}` : `$${pnl?.toFixed(0)}`}
            </Badge>
            {entry.followedRules && <Badge variant="success">Rules Followed</Badge>}
          </div>
          <p className="text-xs text-gray-500">{entry.contract}</p>
          <p className="text-xs text-gray-400">{new Date(entry.createdAt).toLocaleDateString()}</p>
        </div>
        <button onClick={() => removeEntry(entry.id)} className="p-1 hover:bg-red-50 rounded text-gray-300 hover:text-red-500">
          <X size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div className="bg-gray-50 rounded p-2">
          <span className="text-gray-400">Entry</span>
          <span className="float-right font-medium">${entry.entryPrice.toFixed(2)}</span>
        </div>
        <div className="bg-gray-50 rounded p-2">
          <span className="text-gray-400">Exit</span>
          <span className="float-right font-medium">{entry.exitPrice ? `$${entry.exitPrice.toFixed(2)}` : '—'}</span>
        </div>
        <div className="bg-gray-50 rounded p-2 col-span-2">
          <span className="text-gray-400">Emotion</span>
          <span className={`float-right font-medium ${['FOMO', 'Greedy', 'Anxious', 'Impulsive'].includes(entry.emotion) ? 'text-red-600' : 'text-green-700'}`}>
            {entry.emotion || '—'}
          </span>
        </div>
      </div>

      {entry.setup && <p className="text-xs text-gray-600 mb-2"><span className="text-gray-400">Setup: </span>{entry.setup}</p>}
      {entry.lessonLearned && (
        <div className="bg-yellow-50 rounded p-2 mb-3 text-xs text-yellow-800">
          <span className="font-medium">Lesson: </span>{entry.lessonLearned}
        </div>
      )}

      {entry.status === 'open' && !closing && (
        <Button size="sm" variant="secondary" onClick={() => setClosing(true)} className="w-full">
          Close Trade
        </Button>
      )}

      {closing && (
        <div className="space-y-2 animate-fade-in">
          <input
            type="number" step="0.01" placeholder="Exit price"
            value={exitPrice} onChange={e => setExitPrice(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200 outline-none"
          />
          <input
            placeholder="Lesson learned (optional)"
            value={lesson} onChange={e => setLesson(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200 outline-none"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleClose} className="flex-1">Save & Close</Button>
            <Button size="sm" variant="ghost" onClick={() => setClosing(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function AddEntryForm({ onClose }: { onClose: () => void }) {
  const addEntry = useJournalStore(s => s.addEntry);
  const log = useAuditStore(s => s.log);
  const [form, setForm] = useState({ ticker: '', contract: '', entryPrice: '', setup: '', triggerReason: '', emotion: '', followedRules: true });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ticker || !form.entryPrice) return;
    addEntry({
      ticker: form.ticker.toUpperCase(),
      contract: form.contract,
      entryPrice: Number(form.entryPrice),
      setup: form.setup,
      triggerReason: form.triggerReason,
      emotion: form.emotion,
      followedRules: form.followedRules,
    });
    log('Journal Entry Added', `Added journal entry for ${form.ticker}`, 'journal', form.ticker);
    onClose();
  };

  return (
    <Card className="mb-6 border-purple-200">
      <CardHeader title="New Journal Entry" action={<button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>} />
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">Ticker *</label>
            <input value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-purple-200 outline-none" placeholder="e.g. SPY" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Entry Price *</label>
            <input type="number" step="0.01" value={form.entryPrice} onChange={e => setForm(f => ({ ...f, entryPrice: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-purple-200 outline-none" placeholder="e.g. 0.85" />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500">Contract</label>
          <input value={form.contract} onChange={e => setForm(f => ({ ...f, contract: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-purple-200 outline-none" placeholder="e.g. SPY $535 Call May 15" />
        </div>
        <div>
          <label className="text-xs text-gray-500">Setup / Trigger Reason</label>
          <textarea value={form.triggerReason} onChange={e => setForm(f => ({ ...f, triggerReason: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-purple-200 outline-none resize-none" rows={2}
            placeholder="What triggered this trade?" />
        </div>
        <div>
          <label className="text-xs text-gray-500">Emotion at Entry</label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {EMOTIONS.map(em => (
              <button key={em} type="button" onClick={() => setForm(f => ({ ...f, emotion: em }))}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${form.emotion === em ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-600'}`}>
                {em}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={form.followedRules} onChange={e => setForm(f => ({ ...f, followedRules: e.target.checked }))}
            className="accent-purple-600" id="followedRules" />
          <label htmlFor="followedRules" className="text-sm text-gray-600">I followed my trading rules</label>
        </div>
        <Button type="submit" className="w-full">Save Entry</Button>
      </form>
    </Card>
  );
}

export default function JournalPage() {
  const { entries, getStats } = useJournalStore();
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');
  const stats = getStats();

  const filtered = entries.filter(e => filter === 'all' || e.status === filter);

  return (
    <AppShell title="Trade Journal">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl p-3 border border-gray-100 text-center">
          <p className="text-xs text-gray-400">Total Trades</p>
          <p className="text-2xl font-bold">{stats.totalTrades}</p>
        </div>
        <div className="bg-white rounded-xl p-3 border border-gray-100 text-center">
          <p className="text-xs text-gray-400">Win Rate</p>
          <p className={`text-2xl font-bold ${stats.winRate >= 50 ? 'text-green-700' : 'text-red-700'}`}>
            {stats.winRate.toFixed(0)}%
          </p>
        </div>
        <div className="bg-white rounded-xl p-3 border border-gray-100 text-center">
          <p className="text-xs text-gray-400">Wins / Losses</p>
          <p className="text-2xl font-bold">{stats.wins} / {stats.losses}</p>
        </div>
        <div className="bg-white rounded-xl p-3 border border-gray-100 text-center">
          <p className="text-xs text-gray-400">Total P&L</p>
          <p className={`text-2xl font-bold ${stats.totalPnL >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {stats.totalPnL >= 0 ? '+' : ''}${stats.totalPnL.toFixed(0)}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex gap-2">
          {(['all', 'open', 'closed'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border capitalize transition-colors ${filter === f ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-600'}`}>
              {f} ({entries.filter(e => f === 'all' || e.status === f).length})
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus size={13} className="mr-1" /> New Entry
        </Button>
      </div>

      {showAdd && <AddEntryForm onClose={() => setShowAdd(false)} />}

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BookOpen size={28} className="text-purple-600" />
          </div>
          <h3 className="font-semibold text-gray-800 mb-2">No journal entries yet</h3>
          <p className="text-gray-500 text-sm">Click "New Entry" or use "I Entered This" on an alert to auto-create entries.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(entry => <JournalCard key={entry.id} entry={entry} />)}
        </div>
      )}
    </AppShell>
  );
}

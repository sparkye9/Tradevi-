'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useJournalStore } from '@/store/journalStore';

const EMOTION_LABELS: Record<number, string> = {
  1: 'Panicked',
  2: 'Anxious',
  3: 'Focused',
  4: 'Confident',
  5: 'Euphoric',
};

const GRADE_OPTIONS = ['A+', 'A', 'B', 'C', 'D'];

const DEFAULT_RULES = [
  'Follow the regime. No trade in compression.',
  'Size down in C or lower environments.',
  'No revenge trades.',
  'Confirm on higher timeframe before entry.',
  'Journal every trade same day.',
];

const DEFAULT_SCRIPTURES = [
  '"Wealth gained hastily will dwindle, but whoever gathers little by little will increase it." — Proverbs 13:11',
  '"Invest in seven ventures, yes, in eight; you do not know what disaster may come upon the land." — Ecclesiastes 11:2',
  '"Where there is no guidance, a people falls, but in an abundance of counselors there is safety." — Proverbs 11:14',
  '"So, whether you eat or drink, or whatever you do, do all to the glory of God." — 1 Corinthians 10:31',
  '"To everyone who has will more be given, and he will have abundance. From the one who has not, even what he has will be taken away." — Matthew 25:29 (Parable of the Talents)',
  '"For the love of money is a root of all kinds of evil." — 1 Timothy 6:10',
  '"Better is a little with righteousness than great revenues with injustice." — Proverbs 16:8',
  '"Trust in the LORD with all your heart, and do not lean on your own understanding. In all your ways acknowledge him, and he will make straight your paths." — Proverbs 3:5-6',
  '"For which of you, desiring to build a tower, does not first sit down and count the cost, whether he has enough to complete it?" — Luke 14:28-30',
  '"Be still and know that I am God." — Psalm 46:10',
  '"The patient man is better than the warrior." — Proverbs 16:32',
];

type AnyEntry = ReturnType<typeof useJournalStore.getState>['entries'][0] & {
  revengeTraded?: boolean;
  emotionScore?: number;
  notes?: string;
  stopLoss?: number;
  target?: number;
  grade?: string;
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">{label}</span>
      <span className="text-2xl font-bold font-mono text-white">{value}</span>
      {sub && <span className="text-xs text-gray-600">{sub}</span>}
    </div>
  );
}

function GradeBadge({ grade }: { grade?: string }) {
  if (!grade) return <span className="text-gray-600 text-xs">--</span>;
  const color =
    grade === 'A+' || grade === 'A' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
    grade === 'B' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
    'bg-red-500/20 text-red-400 border-red-500/30';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${color}`}>{grade}</span>;
}

function DirectionBadge({ direction }: { direction: string }) {
  const isLong = direction === 'LONG';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
      isLong ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'
    }`}>
      {direction}
    </span>
  );
}

function AddEntryForm({ onClose }: { onClose: () => void }) {
  const addEntry = useJournalStore((s) => s.addEntry);
  const [symbol, setSymbol] = useState('');
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [target, setTarget] = useState('');
  const [notes, setNotes] = useState('');
  const [emotion, setEmotion] = useState(3);
  const [revengeTraded, setRevengeTraded] = useState(false);
  const [grade, setGrade] = useState('B');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!symbol || !entryPrice) return;
    addEntry({
      ticker: symbol.toUpperCase(),
      contract: direction,
      entryPrice: parseFloat(entryPrice),
      setup: direction,
      triggerReason: notes.slice(0, 80),
      emotion: EMOTION_LABELS[emotion],
      followedRules: !revengeTraded,
      revengeTraded,
      stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
      target: target ? parseFloat(target) : undefined,
      notes,
      grade,
      emotionScore: emotion,
    } as Parameters<typeof addEntry>[0]);
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Symbol</label>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="AAPL"
            required
            className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-emerald-500/50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Direction</label>
          <div className="flex rounded-xl overflow-hidden border border-[#2a2a2a]">
            {(['LONG', 'SHORT'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={`flex-1 py-2 text-xs font-bold transition-all ${
                  direction === d
                    ? d === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Entry Price', val: entryPrice, set: setEntryPrice },
          { label: 'Stop Loss', val: stopLoss, set: setStopLoss },
          { label: 'Target', val: target, set: setTarget },
        ].map(({ label, val, set }) => (
          <div key={label} className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">{label}</label>
            <input
              type="number"
              step="0.01"
              value={val}
              onChange={(e) => set(e.target.value)}
              placeholder="0.00"
              className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-emerald-500/50"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Setup rationale, key levels, context..."
          className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500/50 resize-none"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
          Emotional State — <span className="text-amber-400">{emotion}: {EMOTION_LABELS[emotion]}</span>
        </label>
        <input
          type="range"
          min={1} max={5} step={1}
          value={emotion}
          onChange={(e) => setEmotion(parseInt(e.target.value))}
          className="w-full accent-emerald-500"
        />
        <div className="flex justify-between text-[10px] text-gray-600">
          {Object.values(EMOTION_LABELS).map((l) => <span key={l}>{l}</span>)}
        </div>
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={revengeTraded}
            onChange={(e) => setRevengeTraded(e.target.checked)}
            className="accent-red-500 w-4 h-4"
          />
          <span className="text-xs text-gray-400">Revenge Trade</span>
        </label>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Grade</span>
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-emerald-500/50"
          >
            {GRADE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="flex-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl py-2 text-sm font-semibold hover:bg-emerald-500/30 transition-all"
        >
          Add Trade
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 text-gray-500 border border-[#2a2a2a] rounded-xl py-2 text-sm hover:text-gray-300 hover:border-[#3a3a3a] transition-all"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function CloseTradeModal({ id, onClose }: { id: string; onClose: () => void }) {
  const closeEntry = useJournalStore((s) => s.closeEntry);
  const [exitPrice, setExitPrice] = useState('');
  const [lesson, setLesson] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!exitPrice) return;
    closeEntry(id, parseFloat(exitPrice), lesson || undefined);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-6 w-full max-w-md space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-white font-bold text-base">Close Trade</h3>
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Exit Price</label>
          <input
            type="number"
            step="0.01"
            required
            value={exitPrice}
            onChange={(e) => setExitPrice(e.target.value)}
            placeholder="0.00"
            className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-emerald-500/50"
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Lesson Learned</label>
          <textarea
            value={lesson}
            onChange={(e) => setLesson(e.target.value)}
            rows={2}
            placeholder="What did you learn from this trade?"
            className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500/50 resize-none"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            className="flex-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl py-2 text-sm font-semibold hover:bg-emerald-500/30 transition-all"
          >
            Close Trade
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 text-gray-500 border border-[#2a2a2a] rounded-xl py-2 text-sm hover:text-gray-300 transition-all"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function TradeRow({ entry }: { entry: AnyEntry }) {
  const removeEntry = useJournalStore((s) => s.removeEntry);
  const [expanded, setExpanded] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isOpen = entry.status === 'open';
  const pnl = entry.profitLoss;
  const pnlColor = pnl == null ? 'text-gray-600' : pnl > 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <>
      {closingId && <CloseTradeModal id={closingId} onClose={() => setClosingId(null)} />}
      <div
        className={`bg-[#111111] rounded-xl transition-all ${
          isOpen
            ? 'border-l-2 border-l-emerald-500 border border-[#1e1e1e]'
            : 'border border-[#1e1e1e]'
        }`}
      >
        <div
          className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-all"
          onClick={() => setExpanded((p) => !p)}
        >
          <span className="text-white font-bold font-mono w-16 shrink-0">{entry.ticker}</span>
          <DirectionBadge direction={entry.contract} />
          <span className="text-gray-400 font-mono text-sm">${entry.entryPrice.toFixed(2)}</span>
          <span className="text-gray-500 font-mono text-sm">
            {entry.exitPrice != null ? `→ $${entry.exitPrice.toFixed(2)}` : '--'}
          </span>
          <span className={`font-mono text-sm font-semibold ${pnlColor}`}>
            {pnl != null ? `${pnl > 0 ? '+' : ''}$${pnl.toFixed(2)}` : '--'}
          </span>
          <GradeBadge grade={entry.grade} />
          <span className="text-gray-600 text-xs max-w-[100px] truncate hidden md:block ml-2">
            {entry.triggerReason || '--'}
          </span>
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full border ${
            isOpen ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-[#1e1e1e] text-gray-500 border-[#2a2a2a]'
          }`}>
            {isOpen ? 'OPEN' : 'CLOSED'}
          </span>
          <span className="text-gray-600 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>

        {expanded && (
          <div className="px-4 pb-4 border-t border-[#1e1e1e] pt-3 space-y-3">
            {entry.notes && (
              <div>
                <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Notes</span>
                <p className="text-sm text-gray-300 mt-1">{entry.notes}</p>
              </div>
            )}
            {entry.lessonLearned && (
              <div>
                <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Lesson Learned</span>
                <p className="text-sm text-amber-400 mt-1">{entry.lessonLearned}</p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
              <span>Emotion: <span className="text-gray-400">{entry.emotion}</span></span>
              {entry.revengeTraded && (
                <span className="text-red-400 font-semibold border border-red-500/30 bg-red-500/10 px-2 py-0.5 rounded-full">REVENGE TRADE</span>
              )}
              {entry.stopLoss && <span>SL: <span className="font-mono text-gray-400">${entry.stopLoss}</span></span>}
              {entry.target && <span>Target: <span className="font-mono text-gray-400">${entry.target}</span></span>}
              <span className="ml-auto">{new Date(entry.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex gap-2 pt-1">
              {isOpen && (
                <button
                  onClick={() => setClosingId(entry.id)}
                  className="px-3 py-1.5 text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 transition-all"
                >
                  Close Trade
                </button>
              )}
              {confirmDelete ? (
                <>
                  <button
                    onClick={() => removeEntry(entry.id)}
                    className="px-3 py-1.5 text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-all"
                  >
                    Confirm Delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1.5 text-xs text-gray-500 border border-[#2a2a2a] rounded-lg hover:text-gray-300 transition-all"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="px-3 py-1.5 text-xs text-gray-600 border border-[#2a2a2a] rounded-lg hover:text-red-400 hover:border-red-500/30 transition-all"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function JournalTab() {
  const entries = useJournalStore((s) => s.entries) as AnyEntry[];
  const getStats = useJournalStore((s) => s.getStats);
  const getOpenEntries = useJournalStore((s) => s.getOpenEntries);

  const [showForm, setShowForm] = useState(false);
  const [weeklyReflection, setWeeklyReflection] = useState('');

  useEffect(() => {
    setWeeklyReflection(localStorage.getItem('tradevi-weekly-reflection') ?? '');
  }, []);

  const stats = getStats();
  const openEntries = getOpenEntries() as AnyEntry[];
  const closedEntries = entries.filter((e) => e.status === 'closed');
  const ordered = [...openEntries, ...closedEntries];

  const avgEmotion = entries.length > 0
    ? (entries.reduce((s, e) => s + (e.emotionScore ?? 3), 0) / entries.length).toFixed(1)
    : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Trades" value={stats.totalTrades} />
        <StatCard label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} sub={`${stats.wins}W / ${stats.losses}L`} />
        <StatCard
          label="Net P&L"
          value={`${stats.totalPnL >= 0 ? '+' : ''}$${stats.totalPnL.toFixed(2)}`}
        />
        <StatCard label="Open Trades" value={openEntries.length} />
      </div>

      <div className="flex justify-between items-center">
        <h2 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Trade Log</h2>
        <button
          onClick={() => setShowForm((p) => !p)}
          className={`px-4 py-1.5 text-xs font-semibold rounded-full border transition-all ${
            showForm
              ? 'bg-red-500/10 text-red-400 border-red-500/30'
              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
          }`}
        >
          {showForm ? '✕ Cancel' : '+ Add Entry'}
        </button>
      </div>

      {showForm && <AddEntryForm onClose={() => setShowForm(false)} />}

      <div className="space-y-2">
        {ordered.length === 0 && (
          <div className="text-gray-600 text-sm text-center py-10 bg-[#111111] border border-[#1e1e1e] rounded-2xl">
            No trades journaled yet. Add your first entry above.
          </div>
        )}
        {ordered.map((e) => <TradeRow key={e.id} entry={e} />)}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Weekly Reflection</h2>
          <textarea
            value={weeklyReflection}
            onChange={(e) => {
              setWeeklyReflection(e.target.value);
              localStorage.setItem('tradevi-weekly-reflection', e.target.value);
            }}
            rows={5}
            placeholder="What went well? What needs work? What patterns did you notice?"
            className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-3 py-2 text-gray-300 text-sm focus:outline-none focus:border-emerald-500/50 resize-none"
          />
        </div>

        <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Emotional Pattern</h2>
          {avgEmotion ? (
            <>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-bold font-mono text-white">{avgEmotion}</span>
                <span className="text-gray-500 text-sm mb-1">/ 5 avg emotion</span>
              </div>
              <p className="text-xs text-gray-500">
                {parseFloat(avgEmotion) >= 4
                  ? 'High confidence. Watch for overconfidence near Euphoric.'
                  : parseFloat(avgEmotion) <= 2
                  ? 'Elevated anxiety. Consider sizing down or pausing.'
                  : 'Balanced emotional state. Stay focused.'}
              </p>
              <div className="space-y-1 mt-2">
                {Object.entries(EMOTION_LABELS).map(([score, label]) => {
                  const count = entries.filter((e) => e.emotionScore === parseInt(score)).length;
                  const pct = entries.length > 0 ? (count / entries.length) * 100 : 0;
                  return (
                    <div key={score} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-600 w-20">{label}</span>
                      <div className="flex-1 h-1.5 bg-[#1e1e1e] rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-gray-600 w-5 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-gray-600 text-sm">No entries yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function BibleTab() {
  const entries = useJournalStore((s) => s.entries) as AnyEntry[];

  const [rules, setRules] = useState<string[]>([]);
  const [newRule, setNewRule] = useState('');
  const [editingRuleIdx, setEditingRuleIdx] = useState<number | null>(null);
  const [editingRuleVal, setEditingRuleVal] = useState('');

  const [scriptures, setScriptures] = useState<string[]>([]);
  const [newScripture, setNewScripture] = useState('');
  const [editingScriptureIdx, setEditingScriptureIdx] = useState<number | null>(null);
  const [editingScriptureVal, setEditingScriptureVal] = useState('');

  useEffect(() => {
    const r = localStorage.getItem('tradevi-rules');
    setRules(r ? JSON.parse(r) : DEFAULT_RULES);
    const s = localStorage.getItem('tradevi-scriptures');
    setScriptures(s ? JSON.parse(s) : DEFAULT_SCRIPTURES);
  }, []);

  function saveRules(updated: string[]) {
    setRules(updated);
    localStorage.setItem('tradevi-rules', JSON.stringify(updated));
  }

  function saveScriptures(updated: string[]) {
    setScriptures(updated);
    localStorage.setItem('tradevi-scriptures', JSON.stringify(updated));
  }

  const disciplineScore = entries.length > 0
    ? Math.round((entries.filter((e) => !e.revengeTraded).length / entries.length) * 100)
    : 100;

  const recurringMistakes = (() => {
    const bySymbol: Record<string, number[]> = {};
    entries.filter((e) => e.status === 'closed').forEach((e) => {
      if (!bySymbol[e.ticker]) bySymbol[e.ticker] = [];
      bySymbol[e.ticker].push(e.profitLoss ?? 0);
    });
    return Object.entries(bySymbol)
      .filter(([, pnls]) => {
        let consecutive = 0;
        let maxConsecutive = 0;
        for (const p of pnls) {
          if (p < 0) { consecutive++; maxConsecutive = Math.max(maxConsecutive, consecutive); }
          else consecutive = 0;
        }
        return maxConsecutive >= 2;
      })
      .map(([sym]) => sym);
  })();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Discipline Score</h2>
          <div className="flex items-end gap-2">
            <span className={`text-6xl font-bold font-mono ${
              disciplineScore >= 80 ? 'text-emerald-400' : disciplineScore >= 60 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {disciplineScore}%
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Trades without revenge flag: {entries.filter((e) => !e.revengeTraded).length} / {entries.length}
          </p>
        </div>

        <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Recurring Mistakes</h2>
          {recurringMistakes.length === 0 ? (
            <p className="text-gray-600 text-sm">No recurring loss patterns detected.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">Symbols with 2+ consecutive losses:</p>
              <div className="flex flex-wrap gap-2">
                {recurringMistakes.map((sym) => (
                  <span key={sym} className="px-3 py-1 bg-red-500/10 text-red-400 border border-red-500/30 rounded-full text-xs font-mono font-bold">
                    {sym}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-4">
        <h2 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Trading Rules</h2>
        <div className="space-y-2">
          {rules.map((rule, i) => (
            <div key={i} className="flex items-center gap-2 group">
              <span className="text-emerald-500 text-xs font-mono w-5 shrink-0">{i + 1}.</span>
              {editingRuleIdx === i ? (
                <>
                  <input
                    value={editingRuleVal}
                    onChange={(e) => setEditingRuleVal(e.target.value)}
                    className="flex-1 bg-[#0d0d0d] border border-emerald-500/40 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      saveRules(rules.map((r, idx) => idx === i ? editingRuleVal : r));
                      setEditingRuleIdx(null);
                    }}
                    className="text-emerald-400 text-xs hover:text-emerald-300"
                  >
                    Save
                  </button>
                  <button onClick={() => setEditingRuleIdx(null)} className="text-gray-600 text-xs hover:text-gray-400">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-gray-300">{rule}</span>
                  <button
                    onClick={() => { setEditingRuleIdx(i); setEditingRuleVal(rule); }}
                    className="opacity-0 group-hover:opacity-100 text-gray-600 text-xs hover:text-gray-300 transition-opacity"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => saveRules(rules.filter((_, idx) => idx !== i))}
                    className="opacity-0 group-hover:opacity-100 text-gray-700 text-xs hover:text-red-400 transition-opacity"
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-2">
          <input
            value={newRule}
            onChange={(e) => setNewRule(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newRule.trim()) {
                saveRules([...rules, newRule.trim()]);
                setNewRule('');
              }
            }}
            placeholder="Add a rule and press Enter..."
            className="flex-1 bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500/50"
          />
          <button
            onClick={() => { if (newRule.trim()) { saveRules([...rules, newRule.trim()]); setNewRule(''); } }}
            className="px-4 text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl hover:bg-emerald-500/30 transition-all"
          >
            Add
          </button>
        </div>
      </div>

      <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-4">
        <h2 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Scripture & Mindset</h2>
        <div className="space-y-2">
          {scriptures.map((scripture, i) => (
            <div key={i} className="flex items-center gap-2 group">
              {editingScriptureIdx === i ? (
                <>
                  <input
                    value={editingScriptureVal}
                    onChange={(e) => setEditingScriptureVal(e.target.value)}
                    className="flex-1 bg-[#0d0d0d] border border-emerald-500/40 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      saveScriptures(scriptures.map((s, idx) => idx === i ? editingScriptureVal : s));
                      setEditingScriptureIdx(null);
                    }}
                    className="text-emerald-400 text-xs hover:text-emerald-300"
                  >
                    Save
                  </button>
                  <button onClick={() => setEditingScriptureIdx(null)} className="text-gray-600 text-xs hover:text-gray-400">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-gray-400 italic">{scripture}</span>
                  <button
                    onClick={() => { setEditingScriptureIdx(i); setEditingScriptureVal(scripture); }}
                    className="opacity-0 group-hover:opacity-100 text-gray-600 text-xs hover:text-gray-300 transition-opacity"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => saveScriptures(scriptures.filter((_, idx) => idx !== i))}
                    className="opacity-0 group-hover:opacity-100 text-gray-700 text-xs hover:text-red-400 transition-opacity"
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-2">
          <input
            value={newScripture}
            onChange={(e) => setNewScripture(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newScripture.trim()) {
                saveScriptures([...scriptures, newScripture.trim()]);
                setNewScripture('');
              }
            }}
            placeholder="Add a scripture or mindset quote..."
            className="flex-1 bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500/50"
          />
          <button
            onClick={() => { if (newScripture.trim()) { saveScriptures([...scriptures, newScripture.trim()]); setNewScripture(''); } }}
            className="px-4 text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl hover:bg-emerald-500/30 transition-all"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

export default function JournalPage() {
  const [activeTab, setActiveTab] = useState<'journal' | 'bible'>('journal');

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Journal + Bible</h1>
        <p className="text-sm text-gray-500 mt-1">Track every trade. Live by your rules.</p>
      </div>

      <div className="flex gap-1 p-1 bg-[#111111] border border-[#1e1e1e] rounded-2xl w-fit">
        {([['journal', 'Journal'], ['bible', 'Bible & Rules']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === key
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'journal' ? <JournalTab /> : <BibleTab />}
    </div>
  );
}

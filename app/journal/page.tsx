'use client';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useJournalStore } from '@/store/journalStore';

const EMOTIONS = ['calm', 'confident', 'anxious', 'revenge', 'fomo', 'disciplined'];

export default function JournalPage() {
  const { entries, addEntry, closeEntry, removeEntry, getStats } = useJournalStore();
  const stats = getStats();
  const open = entries.filter((e) => e.status === 'open');
  const closed = entries.filter((e) => e.status === 'closed');

  const [ticker, setTicker] = useState('');
  const [contract, setContract] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [setup, setSetup] = useState('');
  const [triggerReason, setTriggerReason] = useState('');
  const [emotion, setEmotion] = useState('calm');
  const [followedRules, setFollowedRules] = useState(true);

  const [closingId, setClosingId] = useState<string | null>(null);
  const [exitPrice, setExitPrice] = useState('');
  const [lesson, setLesson] = useState('');

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    const price = parseFloat(entryPrice);
    if (!ticker.trim() || Number.isNaN(price)) return;
    addEntry({
      ticker: ticker.trim().toUpperCase(),
      contract: contract.trim() || ticker.trim().toUpperCase(),
      entryPrice: price,
      setup: setup.trim() || 'manual',
      triggerReason: triggerReason.trim() || 'logged from Tradevi',
      emotion,
      followedRules,
    });
    setTicker('');
    setContract('');
    setEntryPrice('');
    setSetup('');
    setTriggerReason('');
    setEmotion('calm');
    setFollowedRules(true);
  }

  function handleClose(id: string) {
    const price = parseFloat(exitPrice);
    if (Number.isNaN(price)) return;
    closeEntry(id, price, lesson.trim() || undefined);
    setClosingId(null);
    setExitPrice('');
    setLesson('');
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Journal</h1>
        <p className="text-sm text-gray-500 mt-1">
          Local to this browser. Tradevi does not place trades — you log what you did.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Closed" value={String(stats.totalTrades)} />
        <Stat label="Win rate" value={stats.totalTrades ? `${stats.winRate.toFixed(0)}%` : '—'} />
        <Stat label="Wins / losses" value={`${stats.wins} / ${stats.losses}`} />
        <Stat
          label="P&L"
          value={stats.totalTrades ? stats.totalPnL.toFixed(2) : '—'}
          tone={stats.totalPnL > 0 ? 'up' : stats.totalPnL < 0 ? 'down' : 'flat'}
        />
      </div>
      <p className="text-[11px] text-gray-600 -mt-3">
        Closed P&amp;L uses (exit − entry) × 100, the options-contract convention already in the journal store.
      </p>

      <form onSubmit={handleAdd} className="card space-y-3">
        <div className="label">Log a trade</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Ticker">
            <input
              required
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="MNQ"
              className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white font-mono"
            />
          </Field>
          <Field label="Contract / size">
            <input
              value={contract}
              onChange={(e) => setContract(e.target.value)}
              placeholder="1 MNQ or AAPL 180C"
              className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white font-mono"
            />
          </Field>
          <Field label="Entry price">
            <input
              required
              type="number"
              step="any"
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white font-mono"
            />
          </Field>
          <Field label="Setup">
            <input
              value={setup}
              onChange={(e) => setSetup(e.target.value)}
              placeholder="discount long, ORB, power hour"
              className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white"
            />
          </Field>
        </div>
        <Field label="Why you took it">
          <input
            value={triggerReason}
            onChange={(e) => setTriggerReason(e.target.value)}
            placeholder="Stacked weekly/daily, waited for discount"
            className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white"
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-gray-500">
            Emotion
            <select
              value={emotion}
              onChange={(e) => setEmotion(e.target.value)}
              className="ml-2 bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-sm text-white"
            >
              {EMOTIONS.map((em) => (
                <option key={em} value={em}>
                  {em}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-400 flex items-center gap-2">
            <input
              type="checkbox"
              checked={followedRules}
              onChange={(e) => setFollowedRules(e.target.checked)}
            />
            Followed rules
          </label>
          <button
            type="submit"
            className="ml-auto px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30"
          >
            Add entry
          </button>
        </div>
      </form>

      <section className="space-y-3">
        <div className="label">Open</div>
        {open.length === 0 ? (
          <div className="card text-sm text-gray-600">No open trades.</div>
        ) : (
          open.map((e) => (
            <div key={e.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono font-bold text-white">{e.ticker}</div>
                  <div className="text-xs text-gray-500">{e.contract} · entry {e.entryPrice}</div>
                </div>
                <button
                  onClick={() => removeEntry(e.id)}
                  className="text-[11px] text-gray-600 hover:text-red-400"
                >
                  Delete
                </button>
              </div>
              <p className="text-sm text-gray-300">{e.setup}</p>
              <p className="text-xs text-gray-500">{e.triggerReason}</p>
              {closingId === e.id ? (
                <div className="flex flex-wrap gap-2 items-end pt-1">
                  <Field label="Exit">
                    <input
                      type="number"
                      step="any"
                      value={exitPrice}
                      onChange={(ev) => setExitPrice(ev.target.value)}
                      className="w-28 bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-sm text-white font-mono"
                    />
                  </Field>
                  <Field label="Lesson">
                    <input
                      value={lesson}
                      onChange={(ev) => setLesson(ev.target.value)}
                      className="w-48 bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-sm text-white"
                    />
                  </Field>
                  <button
                    onClick={() => handleClose(e.id)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  >
                    Close
                  </button>
                  <button onClick={() => setClosingId(null)} className="text-xs text-gray-500">
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setClosingId(e.id);
                    setExitPrice('');
                    setLesson('');
                  }}
                  className="text-xs text-emerald-400 hover:text-emerald-300"
                >
                  Close trade
                </button>
              )}
            </div>
          ))
        )}
      </section>

      <section className="space-y-3">
        <div className="label">Closed</div>
        {closed.length === 0 ? (
          <div className="card text-sm text-gray-600">No closed trades yet.</div>
        ) : (
          closed.map((e) => {
            const pnl = e.profitLoss ?? 0;
            const pnlColor = pnl > 0 ? 'text-emerald-400' : pnl < 0 ? 'text-red-400' : 'text-gray-400';
            return (
              <div key={e.id} className="card space-y-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-mono font-bold text-white">{e.ticker}</div>
                  <div className={`font-mono text-sm ${pnlColor}`}>
                    {pnl > 0 ? '+' : ''}
                    {pnl.toFixed(2)}
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  {e.contract} · {e.entryPrice} → {e.exitPrice ?? '—'} · {e.emotion}
                  {e.followedRules ? '' : ' · broke rules'}
                </div>
                {e.lessonLearned && <p className="text-sm text-gray-300">{e.lessonLearned}</p>}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'flat',
}: {
  label: string;
  value: string;
  tone?: 'up' | 'down' | 'flat';
}) {
  const color = tone === 'up' ? 'text-emerald-400' : tone === 'down' ? 'text-red-400' : 'text-white';
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className={`font-mono font-semibold text-lg mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-gray-500">{label}</span>
      {children}
    </label>
  );
}

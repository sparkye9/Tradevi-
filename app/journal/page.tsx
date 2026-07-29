'use client';
import { useState } from 'react';
import { useJournalStore } from '@/store/journalStore';

const EMOTIONS = ['Calm', 'Confident', 'Anxious', 'FOMO', 'Revenge', 'Bored'];

function StatTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card flex flex-col gap-1">
      <span className="label">{label}</span>
      <span className={`text-2xl font-bold font-mono ${color ?? 'text-white'}`}>{value}</span>
    </div>
  );
}

function AddTradeForm({ onClose }: { onClose: () => void }) {
  const addEntry = useJournalStore((s) => s.addEntry);
  const [ticker, setTicker] = useState('');
  const [contract, setContract] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [setup, setSetup] = useState('');
  const [triggerReason, setTriggerReason] = useState('');
  const [emotion, setEmotion] = useState(EMOTIONS[0]);
  const [followedRules, setFollowedRules] = useState(true);

  function submit() {
    const price = parseFloat(entryPrice);
    if (!ticker.trim() || isNaN(price)) return;
    addEntry({
      ticker: ticker.trim().toUpperCase(),
      contract: contract.trim() || 'shares',
      entryPrice: price,
      setup: setup.trim() || 'Not specified',
      triggerReason: triggerReason.trim() || 'Not specified',
      emotion,
      followedRules,
    });
    onClose();
  }

  return (
    <div className="card space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="Ticker"
          className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-emerald-500/50"
        />
        <input
          value={contract}
          onChange={(e) => setContract(e.target.value)}
          placeholder="Contract (or 'shares')"
          className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-emerald-500/50"
        />
        <input
          value={entryPrice}
          onChange={(e) => setEntryPrice(e.target.value)}
          placeholder="Entry price"
          type="number"
          step="0.01"
          className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-emerald-500/50"
        />
        <select
          value={emotion}
          onChange={(e) => setEmotion(e.target.value)}
          className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500/50"
        >
          {EMOTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>
      <input
        value={setup}
        onChange={(e) => setSetup(e.target.value)}
        placeholder="What was the setup? (e.g. RVOL breakout above SMA50)"
        className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500/50"
      />
      <input
        value={triggerReason}
        onChange={(e) => setTriggerReason(e.target.value)}
        placeholder="Why did you enter now?"
        className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500/50"
      />
      <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={followedRules}
          onChange={(e) => setFollowedRules(e.target.checked)}
          className="w-4 h-4 rounded border-[#2a2a2a] bg-[#1a1a1a] accent-emerald-500"
        />
        I followed my rules on this entry
      </label>
      <div className="flex gap-2 justify-end pt-1">
        <button onClick={onClose} className="px-4 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-300 transition-colors">
          Cancel
        </button>
        <button
          onClick={submit}
          className="px-4 py-1.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full hover:bg-emerald-500/30 transition-all"
        >
          Log Trade
        </button>
      </div>
    </div>
  );
}

function CloseTradeRow({ id, ticker, contract, entryPrice }: { id: string; ticker: string; contract: string; entryPrice: number }) {
  const closeEntry = useJournalStore((s) => s.closeEntry);
  const [closing, setClosing] = useState(false);
  const [exitPrice, setExitPrice] = useState('');
  const [lesson, setLesson] = useState('');

  if (!closing) {
    return (
      <div className="flex items-center justify-between py-2.5 border-b border-[#1e1e1e] last:border-0">
        <div>
          <span className="text-white font-mono font-bold">{ticker}</span>
          <span className="text-gray-600 text-xs ml-2">{contract} · entry ${entryPrice.toFixed(2)}</span>
        </div>
        <button
          onClick={() => setClosing(true)}
          className="text-xs font-semibold px-3 py-1 rounded-full border border-[#2a2a2a] text-gray-400 hover:text-white hover:border-emerald-500/30 transition-all"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="py-3 border-b border-[#1e1e1e] last:border-0 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-white font-mono font-bold">{ticker}</span>
        <span className="text-gray-600 text-xs">entry ${entryPrice.toFixed(2)}</span>
      </div>
      <div className="flex gap-2">
        <input
          value={exitPrice}
          onChange={(e) => setExitPrice(e.target.value)}
          placeholder="Exit price"
          type="number"
          step="0.01"
          className="flex-1 bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-white text-sm font-mono focus:outline-none focus:border-emerald-500/50"
        />
        <input
          value={lesson}
          onChange={(e) => setLesson(e.target.value)}
          placeholder="Lesson learned (optional)"
          className="flex-[2] bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-500/50"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={() => setClosing(false)} className="text-xs text-gray-500 hover:text-gray-300 px-3 py-1">Cancel</button>
        <button
          onClick={() => {
            const price = parseFloat(exitPrice);
            if (isNaN(price)) return;
            closeEntry(id, price, lesson.trim() || undefined);
            setClosing(false);
          }}
          className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-all"
        >
          Confirm Exit
        </button>
      </div>
    </div>
  );
}

export default function JournalPage() {
  const { entries, getOpenEntries, getClosedEntries, getStats, removeEntry } = useJournalStore();
  const [showAdd, setShowAdd] = useState(false);

  const open = getOpenEntries();
  const closed = getClosedEntries().slice().sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''));
  const stats = getStats();

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Journal</h1>
          <p className="text-sm text-gray-500 mt-1">Your own track record — logged locally, never shared.</p>
        </div>
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-1.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full hover:bg-emerald-500/30 transition-all"
          >
            + Log Trade
          </button>
        )}
      </div>

      {showAdd && <AddTradeForm onClose={() => setShowAdd(false)} />}

      {/* Stats */}
      {entries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile label="Total Trades" value={String(stats.totalTrades)} />
          <StatTile label="Win Rate" value={`${stats.winRate.toFixed(0)}%`} color={stats.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'} />
          <StatTile label="Wins / Losses" value={`${stats.wins} / ${stats.losses}`} />
          <StatTile
            label="Total P&L"
            value={`${stats.totalPnL >= 0 ? '+' : ''}$${stats.totalPnL.toFixed(2)}`}
            color={stats.totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}
          />
        </div>
      )}

      {entries.length === 0 && !showAdd && (
        <div className="card text-gray-600 text-sm text-center py-10">
          No trades logged yet. Every closed trade here becomes data your coach can use later —
          win rate by setup, best session, most common mistakes.
        </div>
      )}

      {/* Open positions */}
      {open.length > 0 && (
        <section>
          <span className="label mb-2 block">Open ({open.length})</span>
          <div className="card">
            {open.map((e) => (
              <CloseTradeRow key={e.id} id={e.id} ticker={e.ticker} contract={e.contract} entryPrice={e.entryPrice} />
            ))}
          </div>
        </section>
      )}

      {/* Closed history */}
      {closed.length > 0 && (
        <section>
          <span className="label mb-2 block">Closed ({closed.length})</span>
          <div className="overflow-x-auto rounded-2xl border border-[#1e1e1e]">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-[#2a2a2a] bg-[#0f0f0f]">
                  <th className="py-2.5 px-3 label">Ticker</th>
                  <th className="py-2.5 px-3 label">Entry</th>
                  <th className="py-2.5 px-3 label">Exit</th>
                  <th className="py-2.5 px-3 label">P&amp;L</th>
                  <th className="py-2.5 px-3 label">Emotion</th>
                  <th className="py-2.5 px-3 label">Rules</th>
                  <th className="py-2.5 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {closed.map((e, idx) => {
                  const win = (e.profitLoss ?? 0) >= 0;
                  const rowBg = idx % 2 === 0 ? 'bg-[#111111]' : 'bg-[#0d0d0d]';
                  return (
                    <tr key={e.id} className={`${rowBg} border-b border-[#1a1a1a]`}>
                      <td className="py-2.5 px-3 font-mono font-bold text-white">{e.ticker}</td>
                      <td className="py-2.5 px-3 font-mono text-gray-300">${e.entryPrice.toFixed(2)}</td>
                      <td className="py-2.5 px-3 font-mono text-gray-300">{e.exitPrice !== undefined ? `$${e.exitPrice.toFixed(2)}` : '--'}</td>
                      <td className={`py-2.5 px-3 font-mono font-semibold ${win ? 'text-emerald-400' : 'text-red-400'}`}>
                        {e.profitLoss !== undefined ? `${win ? '+' : ''}$${e.profitLoss.toFixed(2)} (${e.profitLossPct?.toFixed(1)}%)` : '--'}
                      </td>
                      <td className="py-2.5 px-3 text-gray-400 text-xs">{e.emotion}</td>
                      <td className="py-2.5 px-3 text-xs">{e.followedRules ? '✅' : '❌'}</td>
                      <td className="py-2.5 px-3 text-right">
                        <button onClick={() => removeEntry(e.id)} className="text-xs text-gray-700 hover:text-red-400 transition-colors">
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

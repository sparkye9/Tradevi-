'use client';
import { useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { useTradeviStore } from '@/store/tradeviStore';

/** Add / remove watchlist tickers. Saved in this browser. */
export default function WatchlistEditor() {
  const { watchlist, addTicker, removeTicker } = useTradeviStore();
  const [input, setInput] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    input
      .split(/[\s,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s))
      .forEach(addTicker);
    setInput('');
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {watchlist.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full border border-tv-border text-xs font-mono text-gray-300"
          >
            {s}
            <button
              onClick={() => removeTicker(s)}
              aria-label={`Remove ${s}`}
              className="p-0.5 rounded-full text-gray-600 hover:text-tv-red hover:bg-tv-red/10"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <form onSubmit={submit} className="inline-flex items-center gap-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            placeholder="Add ticker"
            aria-label="Add ticker to watchlist"
            maxLength={40}
            className="w-24 bg-tv-bg border border-tv-border rounded-full px-2.5 py-0.5 text-xs font-mono text-white uppercase focus:border-tv-purple outline-none"
          />
          <button type="submit" aria-label="Add" className="p-1 rounded-full text-tv-purple hover:bg-tv-purple/10">
            <Plus size={14} />
          </button>
        </form>
      </div>
      <p className="text-[11px] text-tv-muted">Your watchlist is saved in this browser.</p>
    </div>
  );
}

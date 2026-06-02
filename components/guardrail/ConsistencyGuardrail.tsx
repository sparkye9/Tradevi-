'use client';
import { useState, useRef } from 'react';
import { useTradeviStore } from '@/store/tradeviStore';

function fmt(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export default function ConsistencyGuardrail() {
  const {
    pnlEntries,
    addPnlEntry,
    removePnlEntry,
    importPnlCsv,
    tradeifyConcentrationLimit,
    setTradeifyConcentrationLimit,
  } = useTradeviStore();

  const [dateInput, setDateInput] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [addError, setAddError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const totalPnl = pnlEntries.reduce((s, e) => s + e.amount, 0);
  const bestEntry: { date: string; amount: number } | null = pnlEntries.reduce(
    (best: { date: string; amount: number } | null, e) =>
      e.amount > (best?.amount ?? -Infinity) ? e : best,
    null
  );
  const bestDayPnl = bestEntry?.amount ?? 0;
  const concentration =
    totalPnl > 0 && bestDayPnl > 0 ? (bestDayPnl / totalPnl) * 100 : 0;
  const overLimit = concentration > tradeifyConcentrationLimit;

  const today = new Date().toISOString().split('T')[0];
  const todayEntry = pnlEntries.find((e) => e.date === today);

  // Would today push concentration over limit?
  const projectedConcentration =
    todayEntry && totalPnl > 0
      ? (Math.max(bestDayPnl, todayEntry.amount) / totalPnl) * 100
      : null;

  function handleAdd() {
    setAddError('');
    const date = dateInput.trim() || today;
    const amount = parseFloat(amountInput.replace(/[$,]/g, ''));
    if (isNaN(amount)) {
      setAddError('Enter a valid dollar amount.');
      return;
    }
    addPnlEntry(date, amount);
    setDateInput('');
    setAmountInput('');
  }

  function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const csv = ev.target?.result as string;
      if (csv) importPnlCsv(csv);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm">Tradeify Consistency Guardrail</h3>
      </div>

      {/* Warning banner */}
      {overLimit && (
        <div className="flex items-center gap-2 p-3 rounded bg-red-500/10 border border-red-500/30 text-sm text-red-400">
          <span>!</span>
          <span>
            Best-day concentration is {concentration.toFixed(1)}% -- over your {tradeifyConcentrationLimit}% limit.
            Reduce position sizing or stop trading today.
          </span>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#111] rounded p-3">
          <div className="text-xs text-gray-500 mb-1">Total P&amp;L</div>
          <div className={`font-mono font-semibold ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {fmt(totalPnl)}
          </div>
        </div>
        <div className="bg-[#111] rounded p-3">
          <div className="text-xs text-gray-500 mb-1">Best Day</div>
          <div className="font-mono font-semibold text-white">
            {bestEntry ? fmt(bestDayPnl) : '--'}
          </div>
          {bestEntry && <div className="text-xs text-gray-600">{bestEntry.date}</div>}
        </div>
        <div className="bg-[#111] rounded p-3">
          <div className="text-xs text-gray-500 mb-1">Concentration</div>
          <div className={`font-mono font-semibold ${overLimit ? 'text-red-400' : 'text-white'}`}>
            {concentration.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-600">limit {tradeifyConcentrationLimit}%</div>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Concentration vs limit</span>
          <span>{concentration.toFixed(1)}% / {tradeifyConcentrationLimit}%</span>
        </div>
        <div className="w-full h-2 bg-[#111] rounded overflow-hidden">
          <div
            className={`h-2 rounded transition-all ${overLimit ? 'bg-red-500' : 'bg-green-500'}`}
            style={{ width: `${Math.min(100, (concentration / tradeifyConcentrationLimit) * 100)}%` }}
          />
        </div>
      </div>

      {/* Limit setting */}
      <div className="flex items-center gap-2 text-sm">
        <label className="text-gray-400">Limit %:</label>
        <input
          type="number"
          value={tradeifyConcentrationLimit}
          min={1}
          max={100}
          onChange={(e) => setTradeifyConcentrationLimit(Number(e.target.value))}
          className="w-16 bg-[#111] border border-[#2a2a2a] rounded px-2 py-1 text-white text-sm"
        />
      </div>

      {/* Add entry */}
      <div className="space-y-2">
        <div className="text-xs text-gray-500 font-medium">Add today's P&amp;L</div>
        <div className="flex gap-2">
          <input
            type="date"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            placeholder={today}
            className="flex-1 bg-[#111] border border-[#2a2a2a] rounded px-2 py-1 text-white text-sm"
          />
          <input
            type="text"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="e.g. 450 or -120"
            className="flex-1 bg-[#111] border border-[#2a2a2a] rounded px-2 py-1 text-white text-sm"
          />
          <button
            onClick={handleAdd}
            className="px-3 py-1 bg-[#252525] hover:bg-[#2a2a2a] border border-[#2a2a2a] text-white rounded text-sm"
          >
            Add
          </button>
        </div>
        {addError && <div className="text-red-400 text-xs">{addError}</div>}
      </div>

      {/* CSV import */}
      <div>
        <button
          onClick={() => fileRef.current?.click()}
          className="text-xs text-gray-400 hover:text-white underline"
        >
          Import CSV (date, amount columns)
        </button>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileImport} />
      </div>

      {/* Recent entries */}
      {pnlEntries.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          <div className="text-xs text-gray-500 font-medium">Entries</div>
          {[...pnlEntries]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((e) => (
              <div key={e.date} className="flex items-center justify-between text-sm">
                <span className="text-gray-400">{e.date}</span>
                <span className={`font-mono ${e.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {fmt(e.amount)}
                </span>
                <button
                  onClick={() => removePnlEntry(e.date)}
                  className="text-gray-600 hover:text-red-400 text-xs ml-2"
                >
                  x
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

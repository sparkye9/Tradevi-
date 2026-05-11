'use client';
import { useState, useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useWatchlistStore } from '@/store/watchlistStore';
import { useAuditStore } from '@/store/auditStore';
import type { StockQuote } from '@/lib/types';
import { Plus, Trash2, RefreshCw, Eye } from 'lucide-react';

export default function WatchlistPage() {
  const { items, addSymbol, removeSymbol, updateNotes } = useWatchlistStore();
  const log = useAuditStore(s => s.log);
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [newSymbol, setNewSymbol] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchQuotes = async () => {
    if (items.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: items.map(i => i.symbol) }),
      });
      const data = await res.json();
      setQuotes(data.quotes ?? {});
    } catch { }
    setLoading(false);
  };

  useEffect(() => { fetchQuotes(); }, [items.length]);

  const handleAdd = () => {
    if (!newSymbol.trim()) return;
    const sym = newSymbol.toUpperCase().trim();
    addSymbol(sym);
    log('Watchlist Add', `Added ${sym} to watchlist`, 'settings', sym);
    setNewSymbol('');
  };

  const handleRemove = (sym: string) => {
    removeSymbol(sym);
    log('Watchlist Remove', `Removed ${sym} from watchlist`, 'settings', sym);
  };

  return (
    <AppShell title="Positions Watchlist">
      {/* Add symbol */}
      <div className="flex gap-2 mb-6">
        <input
          value={newSymbol}
          onChange={e => setNewSymbol(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Add symbol (e.g. TSLA)"
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none max-w-xs"
        />
        <Button onClick={handleAdd} size="md">
          <Plus size={15} className="mr-1" /> Add
        </Button>
        <Button onClick={fetchQuotes} variant="outline" size="md" loading={loading}>
          <RefreshCw size={14} />
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Eye size={28} className="text-purple-600" />
          </div>
          <h3 className="font-semibold text-gray-800 mb-2">Watchlist is empty</h3>
          <p className="text-gray-500 text-sm">Add symbols above to track them here with live quotes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map(item => {
            const q = quotes[item.symbol];
            return (
              <Card key={item.symbol} className="hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg">{item.symbol}</h3>
                    {q?.shortName && <p className="text-xs text-gray-400">{q.shortName}</p>}
                    <p className="text-xs text-gray-400">Added {new Date(item.addedAt).toLocaleDateString()}</p>
                  </div>
                  <button onClick={() => handleRemove(item.symbol)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>

                {loading ? (
                  <div className="animate-pulse space-y-2">
                    <div className="h-8 bg-gray-100 rounded" />
                    <div className="h-4 bg-gray-100 rounded w-2/3" />
                  </div>
                ) : q ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold text-gray-900">${q.price.toFixed(2)}</span>
                      <span className={`text-sm font-semibold ${q.changePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-gray-50 rounded p-2">
                        <span className="text-gray-400">High</span>
                        <span className="float-right font-medium">${(q.regularMarketDayHigh ?? q.price).toFixed(2)}</span>
                      </div>
                      <div className="bg-gray-50 rounded p-2">
                        <span className="text-gray-400">Low</span>
                        <span className="float-right font-medium">${(q.regularMarketDayLow ?? q.price).toFixed(2)}</span>
                      </div>
                      <div className="bg-gray-50 rounded p-2 col-span-2">
                        <span className="text-gray-400">Volume</span>
                        <span className="float-right font-medium">{((q.volume ?? 0) / 1000000).toFixed(1)}M</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No quote data</p>
                )}

                {item.notes && (
                  <p className="mt-2 text-xs text-gray-500 italic">{item.notes}</p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

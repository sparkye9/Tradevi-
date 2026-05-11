'use client';
import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useAuditStore } from '@/store/auditStore';
import type { AuditLogEntry } from '@/lib/types';
import { ClipboardList, Trash2, Filter } from 'lucide-react';

const CATEGORY_COLORS: Record<AuditLogEntry['category'], string> = {
  alert: 'bg-yellow-100 text-yellow-800',
  trade: 'bg-green-100 text-green-800',
  journal: 'bg-blue-100 text-blue-800',
  settings: 'bg-gray-100 text-gray-600',
  scan: 'bg-purple-100 text-purple-800',
  system: 'bg-orange-100 text-orange-800',
};

export default function AuditPage() {
  const { entries, clear } = useAuditStore();
  const [filter, setFilter] = useState<AuditLogEntry['category'] | 'all'>('all');
  const [confirmClear, setConfirmClear] = useState(false);

  const filtered = filter === 'all' ? entries : entries.filter(e => e.category === filter);

  const categories: Array<AuditLogEntry['category'] | 'all'> = ['all', 'alert', 'trade', 'journal', 'scan', 'settings', 'system'];

  return (
    <AppShell title="Audit Log">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap gap-2">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border capitalize transition-colors ${
                filter === cat ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-600 hover:border-purple-300'
              }`}
            >
              {cat} ({cat === 'all' ? entries.length : entries.filter(e => e.category === cat).length})
            </button>
          ))}
        </div>

        {entries.length > 0 && (
          confirmClear ? (
            <div className="flex gap-2">
              <Button size="sm" variant="danger" onClick={() => { clear(); setConfirmClear(false); }}>Confirm Clear</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)}>
              <Trash2 size={13} className="mr-1" /> Clear Log
            </Button>
          )
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ClipboardList size={28} className="text-purple-600" />
          </div>
          <h3 className="font-semibold text-gray-800 mb-2">No audit log entries</h3>
          <p className="text-gray-500 text-sm">Actions you take in TradeWise will appear here for your records.</p>
        </div>
      ) : (
        <Card padding="none">
          <div className="divide-y divide-gray-50">
            {filtered.map(entry => (
              <div key={entry.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex-shrink-0 pt-0.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${CATEGORY_COLORS[entry.category]}`}>
                    {entry.category}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-800">{entry.action}</p>
                    {entry.symbol && <span className="text-xs text-purple-600 font-medium">{entry.symbol}</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{entry.details}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-xs text-gray-400">{new Date(entry.timestamp).toLocaleDateString()}</p>
                  <p className="text-xs text-gray-400">{new Date(entry.timestamp).toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="mt-4 p-3 bg-blue-50 rounded-xl text-xs text-blue-800">
        <p className="font-medium mb-1">📋 About the Audit Log</p>
        <p>Every action you take — creating alerts, marking trades, updating journals — is logged here. All data is stored locally in your browser. Nothing is sent to any server.</p>
      </div>
    </AppShell>
  );
}

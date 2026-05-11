'use client';
import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { AlertCard } from '@/components/alerts/AlertCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useAlertsStore } from '@/store/alertsStore';
import type { AlertState } from '@/lib/types';
import { Bell, Trash2, Filter } from 'lucide-react';

const STATE_FILTERS: Array<{ label: string; states: AlertState[] | 'all' }> = [
  { label: 'All', states: 'all' },
  { label: 'Active', states: ['watching', 'triggered', 'trade_window_open', 'reviewed'] },
  { label: 'Triggered', states: ['triggered', 'trade_window_open'] },
  { label: 'Completed', states: ['entered_manually', 'skipped', 'invalidated', 'expired', 'closed'] },
];

export default function AlertsPage() {
  const { alerts, clearAll } = useAlertsStore();
  const [stateFilter, setStateFilter] = useState<string>('Active');
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  const filterConfig = STATE_FILTERS.find(f => f.label === stateFilter) ?? STATE_FILTERS[0];
  const filtered = filterConfig.states === 'all'
    ? alerts
    : alerts.filter(a => (filterConfig.states as AlertState[]).includes(a.state));

  const activeCount = alerts.filter(a => ['watching', 'triggered', 'trade_window_open'].includes(a.state)).length;
  const triggeredCount = alerts.filter(a => a.state === 'triggered' || a.state === 'trade_window_open').length;

  return (
    <AppShell title="Trade Alerts">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap gap-2">
          {STATE_FILTERS.map(f => (
            <button
              key={f.label}
              onClick={() => setStateFilter(f.label)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                stateFilter === f.label
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'border-gray-200 text-gray-600 hover:border-purple-300'
              }`}
            >
              {f.label}
              {f.label === 'Triggered' && triggeredCount > 0 && (
                <span className="ml-1.5 bg-red-500 text-white rounded-full px-1.5 py-0.5 text-xs">{triggeredCount}</span>
              )}
            </button>
          ))}
        </div>

        {alerts.length > 0 && (
          <div>
            {showConfirmClear ? (
              <div className="flex gap-2">
                <Button size="sm" variant="danger" onClick={() => { clearAll(); setShowConfirmClear(false); }}>Confirm Clear All</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowConfirmClear(false)}>Cancel</Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setShowConfirmClear(true)}>
                <Trash2 size={13} className="mr-1" /> Clear All
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl p-3 border border-gray-100 text-center">
          <p className="text-xs text-gray-400">Total Alerts</p>
          <p className="text-2xl font-bold text-gray-900">{alerts.length}</p>
        </div>
        <div className="bg-white rounded-xl p-3 border border-gray-100 text-center">
          <p className="text-xs text-gray-400">Active</p>
          <p className="text-2xl font-bold text-purple-700">{activeCount}</p>
        </div>
        <div className="bg-white rounded-xl p-3 border border-gray-100 text-center">
          <p className="text-xs text-gray-400">Trade Window Open</p>
          <p className={`text-2xl font-bold ${triggeredCount > 0 ? 'text-green-600' : 'text-gray-900'}`}>{triggeredCount}</p>
        </div>
        <div className="bg-white rounded-xl p-3 border border-gray-100 text-center">
          <p className="text-xs text-gray-400">Entered Manually</p>
          <p className="text-2xl font-bold text-gray-900">{alerts.filter(a => a.state === 'entered_manually').length}</p>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Bell size={28} className="text-purple-600" />
          </div>
          <h3 className="font-semibold text-gray-800 mb-2">No alerts here</h3>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            Run the scanner and create alerts from opportunity cards. Alerts will guide you through the manual trade decision process.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(alert => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}

      {/* How alerts work */}
      <div className="mt-6 p-4 bg-blue-50 rounded-xl text-xs text-blue-800 space-y-1">
        <p className="font-bold text-sm mb-2">📋 How the 2-Alert System Works:</p>
        <p><strong>Alert 1 (Trade Window Open):</strong> Fires when a setup triggers. Tells you exactly what to review in Robinhood and how long the window is valid.</p>
        <p><strong>Alert 2 (Invalidation Warning):</strong> Shows when the setup becomes invalid so you don't chase a stale or failed setup.</p>
        <p className="mt-2 text-red-700"><strong>⚠️ This app NEVER places trades automatically.</strong> Everything must be manually confirmed in Robinhood.</p>
      </div>
    </AppShell>
  );
}

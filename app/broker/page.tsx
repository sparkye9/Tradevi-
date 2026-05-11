'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { fetchBrokerAccount, fetchPositions, fetchOrders } from '@/lib/apiClient';
import { RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Briefcase } from 'lucide-react';

interface Account {
  buyingPower: number;
  cash: number;
  portfolioValue: number;
  equity: number;
  dayPL: number;
  dayPLPercent: number;
  totalPL: number;
  status: string;
  currency: string;
}

interface Position {
  symbol: string;
  qty: number;
  side: string;
  marketValue: number;
  costBasis: number;
  unrealizedPL: number;
  unrealizedPLPct: number;
  currentPrice: number;
  avgEntryPrice: number;
}

interface Order {
  id: string;
  symbol: string;
  side: string;
  type: string;
  qty: number;
  filledQty: number;
  status: string;
  limitPrice: number;
  filledAvgPrice: number;
  submittedAt: string;
  filledAt: string;
}

export default function BrokerPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'positions' | 'orders'>('positions');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [acct, pos, ord] = await Promise.all([
        fetchBrokerAccount() as Promise<Account>,
        fetchPositions() as Promise<{ positions: Position[] }>,
        fetchOrders() as Promise<{ orders: Order[] }>,
      ]);
      setAccount(acct);
      setPositions(pos.positions);
      setOrders(ord.orders);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to connect to Alpaca. Configure ALPACA_API_KEY in backend/.env');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <AppShell title="Portfolio (Alpaca)">
      {/* Warning banner */}
      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-xs text-amber-800">
        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5 text-amber-600" />
        <div>
          <p className="font-bold">Read-Only Portfolio View</p>
          <p>This page displays your Alpaca account data. This app NEVER places trades automatically. All trading must be done manually in your broker.</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-lg text-gray-900">Alpaca Portfolio</h2>
        <Button size="sm" variant="outline" onClick={load} loading={loading}>
          <RefreshCw size={13} />
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 mb-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <p className="font-bold mb-1">Connection failed</p>
          <p>{error}</p>
          <p className="mt-2 text-xs">Set <code>ALPACA_API_KEY</code>, <code>ALPACA_SECRET_KEY</code>, and <code>ALPACA_BASE_URL</code> in <code>backend/.env</code></p>
        </div>
      )}

      {/* Account stats */}
      {account && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="Portfolio Value" value={`$${account.portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
          <StatCard label="Buying Power" value={`$${account.buyingPower.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
          <StatCard
            label="Day P&L"
            value={`${account.dayPL >= 0 ? '+' : ''}$${account.dayPL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            change={account.dayPLPercent}
            color={account.dayPL >= 0 ? 'green' : 'red'}
          />
          <StatCard
            label="Total P&L"
            value={`${account.totalPL >= 0 ? '+' : ''}$${account.totalPL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            color={account.totalPL >= 0 ? 'green' : 'red'}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {(['positions', 'orders'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border capitalize transition-colors ${
              tab === t ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-600 hover:border-purple-300'
            }`}
          >
            {t} {t === 'positions' ? `(${positions.length})` : `(${orders.length})`}
          </button>
        ))}
      </div>

      {/* Positions */}
      {tab === 'positions' && (
        <Card>
          {positions.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Briefcase size={32} className="mx-auto mb-3 opacity-40" />
              <p>{error ? 'Connect Alpaca to see positions.' : 'No open positions.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Symbol', 'Qty', 'Entry', 'Current', 'Market Value', 'P&L', 'P&L %'].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-gray-400 py-2 px-2 first:pl-0">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {positions.map(p => (
                    <tr key={p.symbol} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5 px-2 first:pl-0 font-semibold text-gray-900">{p.symbol}</td>
                      <td className="py-2.5 px-2 text-gray-600">{p.qty}</td>
                      <td className="py-2.5 px-2 text-gray-600">${p.avgEntryPrice.toFixed(2)}</td>
                      <td className="py-2.5 px-2 text-gray-600">${p.currentPrice.toFixed(2)}</td>
                      <td className="py-2.5 px-2 text-gray-600">${p.marketValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                      <td className={`py-2.5 px-2 font-medium ${p.unrealizedPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {p.unrealizedPL >= 0 ? '+' : ''}${p.unrealizedPL.toFixed(2)}
                      </td>
                      <td className={`py-2.5 px-2 font-medium ${p.unrealizedPLPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {p.unrealizedPLPct >= 0 ? '+' : ''}{p.unrealizedPLPct.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Orders */}
      {tab === 'orders' && (
        <Card>
          {orders.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>{error ? 'Connect Alpaca to see orders.' : 'No recent orders.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Symbol', 'Side', 'Type', 'Qty', 'Filled', 'Price', 'Status', 'Submitted'].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-gray-400 py-2 px-2 first:pl-0">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5 px-2 first:pl-0 font-semibold text-gray-900">{o.symbol}</td>
                      <td className={`py-2.5 px-2 font-medium capitalize ${o.side === 'buy' ? 'text-green-600' : 'text-red-600'}`}>{o.side}</td>
                      <td className="py-2.5 px-2 text-gray-600 capitalize">{o.type}</td>
                      <td className="py-2.5 px-2 text-gray-600">{o.qty}</td>
                      <td className="py-2.5 px-2 text-gray-600">{o.filledQty}</td>
                      <td className="py-2.5 px-2 text-gray-600">
                        {o.filledAvgPrice > 0 ? `$${o.filledAvgPrice.toFixed(2)}` : o.limitPrice > 0 ? `$${o.limitPrice.toFixed(2)} lmt` : '—'}
                      </td>
                      <td className="py-2.5 px-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          o.status === 'filled' ? 'bg-green-100 text-green-700' :
                          o.status === 'canceled' ? 'bg-gray-100 text-gray-600' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>{o.status}</span>
                      </td>
                      <td className="py-2.5 px-2 text-gray-400 text-xs">
                        {o.submittedAt ? new Date(o.submittedAt).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </AppShell>
  );
}

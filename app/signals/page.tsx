'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, BiasBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { StockAnalysis, StockQuote } from '@/lib/types';
import { SCANNER_SYMBOLS } from '@/lib/mock';
import { Zap, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';

interface SignalData {
  symbol: string;
  quote: StockQuote;
  analysis: StockAnalysis;
}

export default function SignalsPage() {
  const [signals, setSignals] = useState<SignalData[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    const symbols = SCANNER_SYMBOLS.slice(0, 10);
    const results = await Promise.allSettled(
      symbols.map(async sym => {
        const [quoteRes, chartRes] = await Promise.all([
          fetch(`/api/quotes/${sym}`),
          fetch(`/api/charts/${sym}`),
        ]);
        const qd = await quoteRes.json();
        const cd = await chartRes.json();
        if (!qd.price) throw new Error(`No quote for ${sym}`);
        const quote: StockQuote = {
          symbol: sym,
          price: qd.price ?? 0,
          change: qd.change ?? 0,
          changePercent: qd.changePercent ?? 0,
          volume: qd.volume ?? 0,
          fiftyTwoWeekHigh: 0,
          fiftyTwoWeekLow: 0,
        };
        return { symbol: sym, quote, analysis: cd.analysis } as SignalData;
      })
    );
    const ok = results
      .filter((r): r is PromiseFulfilledResult<SignalData> => r.status === 'fulfilled' && r.value.quote != null)
      .map(r => r.value);
    setSignals(ok);
    setLastUpdated(new Date().toLocaleTimeString());
    setLoading(false);
  }, []);

  useEffect(() => { fetchSignals(); }, [fetchSignals]);

  const bullish = signals.filter(s => s.analysis?.bias === 'bullish');
  const bearish = signals.filter(s => s.analysis?.bias === 'bearish');
  const neutral = signals.filter(s => s.analysis?.bias === 'neutral');

  const SignalRow = ({ s }: { s: SignalData }) => {
    const { quote, analysis } = s;
    if (!analysis) return null;
    return (
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-purple-50 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${analysis.bias === 'bullish' ? 'bg-green-500' : analysis.bias === 'bearish' ? 'bg-red-500' : 'bg-gray-400'}`} />
          <div>
            <span className="font-bold text-gray-900">{s.symbol}</span>
            <p className="text-xs text-gray-500">
              RSI {analysis.rsi.toFixed(0)} • ATR ${analysis.atr.toFixed(2)} • {analysis.trend}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-semibold">${quote?.price?.toFixed(2) ?? '--'}</p>
          <p className={`text-xs ${(quote?.changePercent ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {(quote?.changePercent ?? 0) >= 0 ? '+' : ''}{(quote?.changePercent ?? 0).toFixed(2)}%
          </p>
        </div>
        <div className="ml-3">
          <BiasBadge bias={analysis.bias} />
        </div>
      </div>
    );
  };

  return (
    <AppShell title="Signals">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-gray-500">
            {signals.length > 0 ? `${signals.length} symbols analyzed • Updated ${lastUpdated}` : 'Loading signals...'}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={fetchSignals} loading={loading}>
          <RefreshCw size={13} className="mr-1" /> Refresh
        </Button>
      </div>

      {/* Market Pulse */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
          <p className="text-xs text-green-600 font-medium">Bullish</p>
          <p className="text-3xl font-bold text-green-700">{bullish.length}</p>
          <p className="text-xs text-green-500">{((bullish.length / Math.max(signals.length, 1)) * 100).toFixed(0)}% of watchlist</p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 font-medium">Neutral</p>
          <p className="text-3xl font-bold text-gray-700">{neutral.length}</p>
          <p className="text-xs text-gray-400">{((neutral.length / Math.max(signals.length, 1)) * 100).toFixed(0)}% of watchlist</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
          <p className="text-xs text-red-600 font-medium">Bearish</p>
          <p className="text-3xl font-bold text-red-700">{bearish.length}</p>
          <p className="text-xs text-red-500">{((bearish.length / Math.max(signals.length, 1)) * 100).toFixed(0)}% of watchlist</p>
        </div>
      </div>

      {loading && (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-3 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-gray-500 text-sm">Fetching signals...</p>
        </div>
      )}

      {!loading && signals.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bullish */}
          <Card>
            <CardHeader title="Bullish Setups" icon={<TrendingUp size={16} className="text-green-600" />}
              subtitle={`${bullish.length} signals`} />
            <div className="space-y-2">
              {bullish.length === 0 ? <p className="text-xs text-gray-400">No bullish signals right now</p>
                : bullish.map(s => <SignalRow key={s.symbol} s={s} />)}
            </div>
          </Card>

          {/* Neutral */}
          <Card>
            <CardHeader title="Neutral / Ranging" subtitle={`${neutral.length} signals`} />
            <div className="space-y-2">
              {neutral.length === 0 ? <p className="text-xs text-gray-400">No neutral signals</p>
                : neutral.map(s => <SignalRow key={s.symbol} s={s} />)}
            </div>
          </Card>

          {/* Bearish */}
          <Card>
            <CardHeader title="Bearish Setups" icon={<TrendingDown size={16} className="text-red-600" />}
              subtitle={`${bearish.length} signals`} />
            <div className="space-y-2">
              {bearish.length === 0 ? <p className="text-xs text-gray-400">No bearish signals right now</p>
                : bearish.map(s => <SignalRow key={s.symbol} s={s} />)}
            </div>
          </Card>
        </div>
      )}

      {/* Key Levels Table */}
      {!loading && signals.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Key Levels — All Symbols" icon={<Zap size={16} />} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[600px]">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Symbol', 'Price', 'Bias', 'Support', 'Resistance', 'Breakout Trigger', 'RSI', 'ATR'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {signals.map(({ symbol, quote, analysis }) => (
                  <tr key={symbol} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 font-bold text-gray-900">{symbol}</td>
                    <td className="px-3 py-2">${(quote?.price ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2"><BiasBadge bias={analysis?.bias ?? 'neutral'} /></td>
                    <td className="px-3 py-2 text-green-700">${(analysis?.support ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-red-700">${(analysis?.resistance ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-purple-700">${(analysis?.breakoutTrigger ?? 0).toFixed(2)}</td>
                    <td className={`px-3 py-2 font-medium ${(analysis?.rsi ?? 50) > 70 ? 'text-red-600' : (analysis?.rsi ?? 50) < 30 ? 'text-green-600' : ''}`}>
                      {(analysis?.rsi ?? 0).toFixed(1)}
                    </td>
                    <td className="px-3 py-2">${(analysis?.atr ?? 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </AppShell>
  );
}

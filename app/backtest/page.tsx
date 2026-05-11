'use client';
import { useState, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { CandleData, BacktestResult, BacktestTrade } from '@/lib/types';
import { calcATR } from '@/lib/indicators';
import { SCANNER_SYMBOLS } from '@/lib/mock';
import { FlaskConical, TrendingUp } from 'lucide-react';

function runORBBacktest(candles: CandleData[], stopMultiplier: number, targetMultiplier: number): BacktestResult['trades'] {
  if (candles.length < 20) return [];
  const trades: BacktestResult['trades'] = [];
  const atr = calcATR(candles, 14);

  for (let i = 5; i < candles.length - 3; i++) {
    const orHigh = Math.max(...candles.slice(i - 4, i).map(c => c.high));
    const orLow = Math.min(...candles.slice(i - 4, i).map(c => c.low));
    const current = candles[i];

    if (current.close > orHigh * 1.002) {
      const entry = current.close;
      const stop = entry - atr * stopMultiplier;
      const target = entry + atr * targetMultiplier;
      let exit = entry;
      let holdBars = 0;
      for (let j = i + 1; j < Math.min(i + 20, candles.length); j++) {
        holdBars++;
        if (candles[j].low <= stop) { exit = stop; break; }
        if (candles[j].high >= target) { exit = target; break; }
        if (j === Math.min(i + 19, candles.length - 1)) exit = candles[j].close;
      }
      const pnl = exit - entry;
      trades.push({ date: new Date(candles[i].time * 1000).toLocaleDateString(), entryPrice: Math.round(entry * 100) / 100, exitPrice: Math.round(exit * 100) / 100, direction: 'long', result: pnl > 0 ? 'win' : 'loss', pnl: Math.round(pnl * 100) / 100, pnlPct: Math.round((pnl / entry) * 10000) / 100, holdingBars: holdBars });
    } else if (current.close < orLow * 0.998) {
      const entry = current.close;
      const stop = entry + atr * stopMultiplier;
      const target = entry - atr * targetMultiplier;
      let exit = entry;
      let holdBars = 0;
      for (let j = i + 1; j < Math.min(i + 20, candles.length); j++) {
        holdBars++;
        if (candles[j].high >= stop) { exit = stop; break; }
        if (candles[j].low <= target) { exit = target; break; }
        if (j === Math.min(i + 19, candles.length - 1)) exit = candles[j].close;
      }
      const pnl = entry - exit;
      trades.push({ date: new Date(candles[i].time * 1000).toLocaleDateString(), entryPrice: Math.round(entry * 100) / 100, exitPrice: Math.round(exit * 100) / 100, direction: 'short', result: pnl > 0 ? 'win' : 'loss', pnl: Math.round(pnl * 100) / 100, pnlPct: Math.round((pnl / entry) * 10000) / 100, holdingBars: holdBars });
    }
  }
  return trades;
}

export default function BacktestPage() {
  const [symbol, setSymbol] = useState('SPY');
  const [stopMult, setStopMult] = useState(1.0);
  const [targetMult, setTargetMult] = useState(2.0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);

  const runBacktest = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/chart?symbol=${symbol}&period=1y&interval=1d`);
      const data = await res.json();
      const candles: CandleData[] = data.candles ?? [];
      const trades = runORBBacktest(candles, stopMult, targetMult);
      const wins = trades.filter(t => t.result === 'win');
      const losses = trades.filter(t => t.result === 'loss');
      const avgGain = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length) : 0;
      const netProfit = trades.reduce((s, t) => s + t.pnl, 0);
      let maxDD = 0, peak = 0, equity = 0;
      for (const t of trades) {
        equity += t.pnl;
        if (equity > peak) peak = equity;
        const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
        if (dd > maxDD) maxDD = dd;
      }
      setResult({
        symbol, strategy: 'ORB Breakout', timeframe: '1D', totalTrades: trades.length,
        winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
        avgGain, avgLoss,
        profitFactor: avgLoss > 0 ? avgGain / avgLoss : 0,
        maxDrawdown: maxDD, netProfit, trades,
      });
    } catch { }
    setLoading(false);
  }, [symbol, stopMult, targetMult]);

  return (
    <AppShell title="Backtest Lab">
      <div className="p-3 mb-6 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
        <strong>⚠️ Backtest Disclaimer:</strong> Backtested results are hypothetical and do not represent actual trading. Past performance does not guarantee future results. Results do not account for commissions, slippage, or bid/ask spreads.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Config */}
        <Card>
          <CardHeader title="Backtest Settings" icon={<FlaskConical size={16} />} />
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Symbol</label>
              <select value={symbol} onChange={e => setSymbol(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200 outline-none">
                {SCANNER_SYMBOLS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Strategy</label>
              <div className="bg-purple-50 rounded-lg px-3 py-2 text-sm text-purple-700 font-medium">ORB (Opening Range Breakout)</div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Stop Loss: {stopMult}x ATR</label>
              <input type="range" min={0.5} max={3} step={0.25} value={stopMult} onChange={e => setStopMult(Number(e.target.value))} className="w-full accent-purple-600" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Target: {targetMult}x ATR</label>
              <input type="range" min={1} max={5} step={0.25} value={targetMult} onChange={e => setTargetMult(Number(e.target.value))} className="w-full accent-purple-600" />
            </div>
            <p className="text-xs text-gray-400">Risk:Reward = 1:{(targetMult / stopMult).toFixed(1)}</p>
            <Button onClick={runBacktest} loading={loading} className="w-full">Run Backtest (1 Year)</Button>
          </div>
        </Card>

        {/* Results */}
        <div className="lg:col-span-2">
          {!result && !loading && (
            <div className="text-center py-16">
              <FlaskConical size={40} className="text-purple-300 mx-auto mb-4" />
              <p className="text-gray-500">Configure parameters and run the backtest</p>
            </div>
          )}
          {loading && (
            <div className="text-center py-16">
              <div className="w-8 h-8 border-3 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto" />
              <p className="mt-3 text-gray-500">Running backtest on {symbol}...</p>
            </div>
          )}
          {result && !loading && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'Total Trades', value: result.totalTrades, color: '' },
                  { label: 'Win Rate', value: `${result.winRate.toFixed(1)}%`, color: result.winRate >= 50 ? 'text-green-700' : 'text-red-700' },
                  { label: 'Profit Factor', value: result.profitFactor.toFixed(2), color: result.profitFactor >= 1.5 ? 'text-green-700' : 'text-red-700' },
                  { label: 'Max Drawdown', value: `${result.maxDrawdown.toFixed(1)}%`, color: 'text-red-700' },
                  { label: 'Avg Gain', value: `${result.avgGain.toFixed(1)}%`, color: 'text-green-700' },
                  { label: 'Avg Loss', value: `${result.avgLoss.toFixed(1)}%`, color: 'text-red-700' },
                  { label: 'Net P&L (pts)', value: result.netProfit.toFixed(2), color: result.netProfit >= 0 ? 'text-green-700' : 'text-red-700' },
                  { label: 'Strategy', value: result.strategy, color: 'text-purple-700' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-white rounded-xl p-3 border border-gray-100 text-center">
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className={`text-lg font-bold mt-0.5 ${color}`}>{value}</p>
                  </div>
                ))}
              </div>

              <Card>
                <CardHeader title={`Trade Log (${result.trades.length} trades)`} />
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-gray-100">
                        {['Date', 'Dir', 'Entry', 'Exit', 'P&L', 'P&L %', 'Bars'].map(h => (
                          <th key={h} className="px-2 py-2 text-left text-gray-500 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.slice(-50).map((t, i) => (
                        <tr key={i} className={`border-b border-gray-50 ${t.result === 'win' ? 'bg-green-50/30' : 'bg-red-50/30'}`}>
                          <td className="px-2 py-1.5">{t.date}</td>
                          <td className="px-2 py-1.5 capitalize">{t.direction}</td>
                          <td className="px-2 py-1.5">${t.entryPrice}</td>
                          <td className="px-2 py-1.5">${t.exitPrice}</td>
                          <td className={`px-2 py-1.5 font-medium ${t.result === 'win' ? 'text-green-700' : 'text-red-700'}`}>
                            {t.pnl > 0 ? '+' : ''}{t.pnl.toFixed(2)}
                          </td>
                          <td className={`px-2 py-1.5 ${t.result === 'win' ? 'text-green-700' : 'text-red-700'}`}>
                            {t.pnlPct > 0 ? '+' : ''}{t.pnlPct.toFixed(1)}%
                          </td>
                          <td className="px-2 py-1.5 text-gray-500">{t.holdingBars}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

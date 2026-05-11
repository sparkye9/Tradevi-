'use client';
import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, X, ChevronDown, ChevronUp } from 'lucide-react';
import type { RRSetup } from './chartTypes';

interface Props {
  setup: RRSetup;
  onChange: (s: RRSetup) => void;
  onClose: () => void;
  currentPrice?: number | null;
}

// ── Options pricing helpers (Black-Scholes approximation) ─────────────────────
function blackScholesCall(S: number, K: number, T: number, r: number, sigma: number) {
  if (T <= 0) return Math.max(S - K, 0);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
}

function blackScholesPut(S: number, K: number, T: number, r: number, sigma: number) {
  if (T <= 0) return Math.max(K - S, 0);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
}

function normalCDF(x: number) {
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

// ── Derived metrics ────────────────────────────────────────────────────────────
function calcMetrics(s: RRSetup) {
  const { direction, entry, stop, target, accountSize, riskPercent } = s;
  if (!entry || !stop || !target) return null;

  const riskPerShare   = Math.abs(entry - stop);
  const rewardPerShare = Math.abs(target - entry);
  const rrRatio        = riskPerShare > 0 ? rewardPerShare / riskPerShare : 0;
  const dollarRisk     = accountSize * (riskPercent / 100);
  const shares         = riskPerShare > 0 ? Math.floor(dollarRisk / riskPerShare) : 0;
  const totalCost      = shares * entry;
  const maxGain        = shares * rewardPerShare;
  const maxLoss        = shares * riskPerShare;
  const breakEven      = direction === 'long' ? entry + riskPerShare * 0 : entry - riskPerShare * 0;

  return { riskPerShare, rewardPerShare, rrRatio, dollarRisk, shares, totalCost, maxGain, maxLoss, breakEven };
}

// ── Stock sizing section ───────────────────────────────────────────────────────
function StockSection({ setup, metrics }: { setup: RRSetup; metrics: ReturnType<typeof calcMetrics> }) {
  if (!metrics) return <p className="text-xs text-gray-400">Enter entry, stop, and target prices to calculate sizing.</p>;
  const { rrRatio, shares, totalCost, maxGain, maxLoss, dollarRisk } = metrics;
  const rrGood = rrRatio >= 2;

  return (
    <div className="space-y-2">
      {/* R/R Ratio badge */}
      <div className={`flex items-center justify-between p-2 rounded-lg ${rrGood ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
        <span className="text-xs font-semibold text-gray-600">R/R Ratio</span>
        <span className={`text-sm font-bold ${rrGood ? 'text-green-700' : 'text-yellow-700'}`}>
          {rrRatio.toFixed(2)}:1 {rrGood ? '✓ Good' : '⚠ Low'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5 text-xs">
        <div className="bg-gray-50 rounded p-2">
          <div className="text-gray-400 mb-0.5">Shares</div>
          <div className="font-bold text-gray-800">{shares.toLocaleString()}</div>
        </div>
        <div className="bg-gray-50 rounded p-2">
          <div className="text-gray-400 mb-0.5">Position Cost</div>
          <div className="font-bold text-gray-800">${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="bg-red-50 rounded p-2">
          <div className="text-red-400 mb-0.5">Max Loss</div>
          <div className="font-bold text-red-600">-${maxLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="bg-green-50 rounded p-2">
          <div className="text-green-400 mb-0.5">Max Gain</div>
          <div className="font-bold text-green-600">+${maxGain.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">
        Risking <span className="font-semibold text-gray-700">${dollarRisk.toFixed(0)}</span> ({setup.riskPercent}% of account) on{' '}
        <span className="font-semibold text-gray-700">{shares} shares</span> @ ${setup.entry.toFixed(2)}.
        {rrGood
          ? ` This setup offers a favorable ${rrRatio.toFixed(1)}:1 reward-to-risk ratio.`
          : ` A 2:1 or better ratio is generally preferred.`}
      </p>
    </div>
  );
}

// ── Options section ────────────────────────────────────────────────────────────
function OptionsSection({ setup, metrics }: { setup: RRSetup; metrics: ReturnType<typeof calcMetrics> }) {
  const [iv, setIv]     = useState(30);   // implied vol %
  const [dte, setDte]   = useState(14);   // days to expiry
  const [contracts, setContracts] = useState(1);

  if (!metrics || !setup.entry) return <p className="text-xs text-gray-400">Enter prices above to use options mode.</p>;

  const S = setup.entry;
  const K = setup.entry; // ATM strike approx
  const T = dte / 365;
  const r = 0.05;
  const sigma = iv / 100;

  const optionPrice = setup.direction === 'long'
    ? blackScholesCall(S, K, T, r, sigma)
    : blackScholesPut(S, K, T, r, sigma);

  const contractCost = optionPrice * 100 * contracts;

  const atTargetPrice = setup.direction === 'long'
    ? blackScholesCall(setup.target, K, T * 0.5, r, sigma)
    : blackScholesPut(setup.target, K, T * 0.5, r, sigma);

  const atStopPrice = setup.direction === 'long'
    ? blackScholesCall(setup.stop, K, T * 0.5, r, sigma)
    : blackScholesPut(setup.stop, K, T * 0.5, r, sigma);

  const gainAtTarget = (atTargetPrice - optionPrice) * 100 * contracts;
  const lossAtStop   = (atStopPrice - optionPrice) * 100 * contracts;

  const dollarRisk    = setup.accountSize * (setup.riskPercent / 100);
  const contractsForRisk = Math.floor(dollarRisk / contractCost);

  return (
    <div className="space-y-2">
      {/* Inputs */}
      <div className="grid grid-cols-3 gap-1.5">
        <div>
          <label className="block text-[10px] text-gray-400 mb-0.5">IV %</label>
          <input type="number" value={iv} min={5} max={200} onChange={e => setIv(Number(e.target.value))}
            className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-300" />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-0.5">DTE</label>
          <input type="number" value={dte} min={1} max={365} onChange={e => setDte(Number(e.target.value))}
            className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-300" />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-0.5">Contracts</label>
          <input type="number" value={contracts} min={1} max={100} onChange={e => setContracts(Number(e.target.value))}
            className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-300" />
        </div>
      </div>

      {/* Results */}
      <div className="grid grid-cols-2 gap-1.5 text-xs">
        <div className="bg-gray-50 rounded p-2">
          <div className="text-gray-400 mb-0.5">Est. Premium</div>
          <div className="font-bold text-gray-800">${optionPrice.toFixed(2)}/share</div>
        </div>
        <div className="bg-gray-50 rounded p-2">
          <div className="text-gray-400 mb-0.5">Contract Cost</div>
          <div className="font-bold text-gray-800">${contractCost.toFixed(0)}</div>
        </div>
        <div className="bg-red-50 rounded p-2">
          <div className="text-red-400 mb-0.5">P&L at Stop</div>
          <div className={`font-bold ${lossAtStop >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {lossAtStop >= 0 ? '+' : ''}{lossAtStop.toFixed(0)}
          </div>
        </div>
        <div className="bg-green-50 rounded p-2">
          <div className="text-green-400 mb-0.5">P&L at Target</div>
          <div className="font-bold text-green-600">+${gainAtTarget.toFixed(0)}</div>
        </div>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">
        ATM {setup.direction === 'long' ? 'call' : 'put'} @ ${optionPrice.toFixed(2)} premium.
        {' '}To risk ${dollarRisk.toFixed(0)}, buy ~{contractsForRisk} contract{contractsForRisk !== 1 ? 's' : ''}.
        {' '}Based on simplified Black-Scholes; use as a rough guide only.
      </p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function RiskRewardPanel({ setup, onChange, onClose, currentPrice }: Props) {
  const [mode, setMode] = useState<'stock' | 'options'>('stock');
  const metrics = calcMetrics(setup);

  // Auto-fill entry from live price
  useEffect(() => {
    if (currentPrice && !setup.entry) {
      onChange({ ...setup, entry: parseFloat(currentPrice.toFixed(2)) });
    }
  }, [currentPrice]);

  const field = (label: string, key: keyof RRSetup, min = 0, step = 0.01) => (
    <div>
      <label className="block text-[10px] text-gray-400 mb-0.5">{label}</label>
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
        <input
          type="number"
          value={(setup[key] as number) || ''}
          min={min}
          step={step}
          onChange={e => onChange({ ...setup, [key]: parseFloat(e.target.value) || 0 })}
          placeholder="0.00"
          className="w-full pl-5 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-300"
        />
      </div>
    </div>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-72 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-gray-900">Risk / Reward</span>
        </div>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
          <X size={15} />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 px-3 py-3 space-y-3">
        {/* Direction */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
          {(['long', 'short'] as const).map(dir => (
            <button
              key={dir}
              onClick={() => onChange({ ...setup, direction: dir })}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors ${
                setup.direction === dir
                  ? dir === 'long' ? 'bg-green-600 text-white' : 'bg-red-500 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {dir === 'long' ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {dir === 'long' ? 'Long' : 'Short'}
            </button>
          ))}
        </div>

        {/* Price inputs */}
        <div className="grid grid-cols-3 gap-2">
          {field('Entry', 'entry')}
          {field('Stop Loss', 'stop')}
          {field('Target', 'target')}
        </div>

        {/* Account sizing */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-gray-400 mb-0.5">Account ($)</label>
            <input
              type="number"
              value={setup.accountSize || ''}
              min={100}
              step={500}
              onChange={e => onChange({ ...setup, accountSize: parseFloat(e.target.value) || 0 })}
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-300"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-400 mb-0.5">Risk %</label>
            <input
              type="number"
              value={setup.riskPercent}
              min={0.1}
              max={10}
              step={0.1}
              onChange={e => onChange({ ...setup, riskPercent: parseFloat(e.target.value) || 1 })}
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-300"
            />
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          {(['stock', 'options'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-1.5 font-medium transition-colors ${
                mode === m ? 'bg-purple-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {m === 'stock' ? '📊 Stock' : '🎯 Options'}
            </button>
          ))}
        </div>

        {/* Results */}
        {mode === 'stock'
          ? <StockSection setup={setup} metrics={metrics} />
          : <OptionsSection setup={setup} metrics={metrics} />
        }
      </div>
    </div>
  );
}

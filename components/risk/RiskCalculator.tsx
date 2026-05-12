'use client';
import { useState, useEffect } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { calcRisk, formatCurrency, getRiskColor } from '@/lib/risk';
import type { RiskCalculationInput } from '@/lib/types';
import { useSettingsStore } from '@/store/settingsStore';
import { Shield, AlertTriangle } from 'lucide-react';

export function RiskCalculator() {
  const accountSize = useSettingsStore(s => s.accountSize);
  const maxRiskPercent = useSettingsStore(s => s.maxRiskPercent);
  const [input, setInput] = useState<RiskCalculationInput>({
    accountSize,
    maxRiskPercent,
    contractAsk: 0.50,
    stopLossPercent: 50,
    numberOfContracts: 1,
  });

  const [result, setResult] = useState(() => calcRisk(input));

  useEffect(() => {
    setInput(prev => {
      const next = { ...prev, accountSize, maxRiskPercent };
      setResult(calcRisk(next));
      return next;
    });
  }, [accountSize, maxRiskPercent]);

  const update = (field: keyof RiskCalculationInput, value: number) => {
    const newInput = { ...input, [field]: value };
    setInput(newInput);
    setResult(calcRisk(newInput));
  };

  return (
    <Card>
      <CardHeader title="Risk Calculator" icon={<Shield size={16} />} />
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {/* Account Size */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Account Size ($)</label>
            <input
              type="number" step="500" min="0"
              value={input.accountSize}
              onChange={e => update('accountSize', Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
            />
          </div>
          {/* Max Risk % */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Max Risk % per Trade</label>
            <input
              type="number" step="0.5" min="0.1" max="10"
              value={input.maxRiskPercent}
              onChange={e => update('maxRiskPercent', Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
            />
          </div>
          {/* Contract Ask */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Contract Ask Price ($)</label>
            <input
              type="number" step="0.05" min="0.01"
              value={input.contractAsk}
              onChange={e => update('contractAsk', Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
            />
          </div>
          {/* Stop Loss % */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Stop Loss % (of option value)</label>
            <input
              type="number" step="5" min="10" max="100"
              value={input.stopLossPercent}
              onChange={e => update('stopLossPercent', Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
            />
          </div>
          {/* Number of Contracts */}
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">Number of Contracts</label>
            <input
              type="number" step="1" min="1"
              value={input.numberOfContracts}
              onChange={e => update('numberOfContracts', Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
            />
          </div>
        </div>

        {/* Results */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Results</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400">Max Contracts Allowed</p>
              <p className="font-bold text-gray-900 text-xl">{result.maxContractsAllowed}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Position Cost</p>
              <p className="font-bold text-gray-900">{formatCurrency(result.positionCost)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Max Loss</p>
              <p className={`font-bold text-lg ${result.isTooRisky ? 'text-red-600' : 'text-gray-900'}`}>
                {formatCurrency(result.maxLoss)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Risk %</p>
              <p className={`font-bold text-lg ${getRiskColor(result.riskPercent)}`}>
                {result.riskPercent.toFixed(2)}%
              </p>
            </div>
          </div>

          <div className={`rounded-lg p-3 text-sm font-medium ${result.isTooRisky ? 'bg-red-50 text-red-700' : result.isLottery ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700'}`}>
            {result.isTooRisky ? '⛔ ' : result.isLottery ? '⚠️ ' : '✅ '}{result.recommendation}
          </div>

          {result.warnings.length > 0 && (
            <div className="space-y-1.5">
              {result.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded p-2">
                  <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                  {w}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

'use client';
import { useState } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { ScannerFilters } from '@/lib/types';
import { SCANNER_SYMBOLS } from '@/lib/mock';
import { Filter, RefreshCw } from 'lucide-react';

interface Props {
  filters: ScannerFilters;
  onChange: (filters: Partial<ScannerFilters>) => void;
  onScan: () => void;
  loading: boolean;
}

export function ScannerFiltersPanel({ filters, onChange, onScan, loading }: Props) {
  return (
    <Card>
      <CardHeader title="Scanner Filters" icon={<Filter size={16} />} />
      <div className="space-y-4">
        {/* Max Premium */}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Max Premium (per contract)</label>
          <div className="flex gap-1.5 flex-wrap">
            {[25, 50, 100, 200, 500].map(p => (
              <button
                key={p}
                onClick={() => onChange({ maxPremium: p })}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  filters.maxPremium === p
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                }`}
              >
                ${p}
              </button>
            ))}
          </div>
        </div>

        {/* Trade Type */}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Trade Type</label>
          <div className="grid grid-cols-3 gap-1">
            {(['day', 'swing', 'both'] as const).map(t => (
              <button
                key={t}
                onClick={() => onChange({ tradeType: t })}
                className={`py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize ${
                  filters.tradeType === t
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                }`}
              >
                {t === 'day' ? '0–3 DTE' : t === 'swing' ? '7–45 DTE' : 'Both'}
              </button>
            ))}
          </div>
        </div>

        {/* Option Type */}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Option Type</label>
          <div className="grid grid-cols-3 gap-1">
            {(['calls', 'puts', 'both'] as const).map(t => (
              <button
                key={t}
                onClick={() => onChange({ optionType: t })}
                className={`py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize ${
                  filters.optionType === t
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Bias */}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Bias Filter</label>
          <div className="grid grid-cols-3 gap-1">
            {(['bullish', 'bearish', 'both'] as const).map(b => (
              <button
                key={b}
                onClick={() => onChange({ biasFilter: b })}
                className={`py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize ${
                  filters.biasFilter === b
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* Min Score */}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            Min Opportunity Score: {filters.minOpportunityScore}
          </label>
          <input
            type="range" min={0} max={80} step={5}
            value={filters.minOpportunityScore}
            onChange={e => onChange({ minOpportunityScore: Number(e.target.value) })}
            className="w-full accent-purple-600"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-0.5">
            <span>0 (all)</span><span>40 (quality)</span><span>80 (top only)</span>
          </div>
        </div>

        {/* Min Open Interest */}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Min Open Interest</label>
          <input
            type="number"
            min={0}
            value={filters.minOpenInterest}
            onChange={e => onChange({ minOpenInterest: Number(e.target.value) })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
          />
        </div>

        {/* DTE Range */}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">DTE Range</label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0}
              value={filters.minDTE}
              onChange={e => onChange({ minDTE: Number(e.target.value) })}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
              placeholder="Min"
            />
            <input
              type="number"
              min={0}
              value={filters.maxDTE}
              onChange={e => onChange({ maxDTE: Number(e.target.value) })}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
              placeholder="Max"
            />
          </div>
        </div>

        {/* Include Lottery */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-xs font-medium text-gray-600">Include Lottery Contracts</label>
            <p className="text-xs text-gray-400">High risk, most expire worthless</p>
          </div>
          <button
            onClick={() => onChange({ includeLottery: !filters.includeLottery })}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              filters.includeLottery ? 'bg-purple-600' : 'bg-gray-200'
            }`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
              filters.includeLottery ? 'translate-x-4.5' : 'translate-x-0.5'
            }`} />
          </button>
        </div>

        <Button onClick={onScan} loading={loading} className="w-full" size="md">
          <RefreshCw size={14} className="mr-2" />
          {loading ? 'Scanning...' : 'Run Scanner'}
        </Button>
      </div>
    </Card>
  );
}

'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge, RiskBadge, ScoreBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Opportunity } from '@/lib/types';
import { opportunityToAlert } from '@/lib/alerts';
import { useAlertsStore } from '@/store/alertsStore';
import { useAuditStore } from '@/store/auditStore';
import { ChevronDown, ChevronUp, Bell, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

const wouldTakeConfig = {
  yes: { label: '✅ Would Take', color: 'bg-green-100 text-green-800' },
  watch: { label: '👀 Watch Only', color: 'bg-yellow-100 text-yellow-800' },
  skip: { label: '⏭ Skip', color: 'bg-gray-100 text-gray-600' },
  lottery: { label: '🎰 Lottery Only', color: 'bg-orange-100 text-orange-800' },
};

export function OpportunityCard({ opp }: { opp: Opportunity }) {
  const [expanded, setExpanded] = useState(false);
  const addAlert = useAlertsStore(s => s.addAlert);
  const log = useAuditStore(s => s.log);

  const handleCreateAlert = () => {
    const alert = opportunityToAlert(opp);
    addAlert(alert);
    log('Alert Created', `Created alert for ${opp.symbol} ${opp.contract.type.toUpperCase()} $${opp.contract.strike} exp ${opp.contract.expiration}`, 'alert', opp.symbol);
  };

  const wt = wouldTakeConfig[opp.wouldTake];
  const isCall = opp.direction === 'bullish';

  return (
    <Card className="hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isCall ? 'bg-green-100' : 'bg-red-100'}`}>
            {isCall ? <TrendingUp size={16} className="text-green-700" /> : <TrendingDown size={16} className="text-red-700" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900">{opp.symbol}</span>
              <Badge variant={isCall ? 'success' : 'danger'} size="sm">
                {isCall ? 'CALL' : 'PUT'}
              </Badge>
            </div>
            <p className="text-xs text-gray-500">{opp.setupType}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <ScoreBadge score={opp.opportunityScore} />
          <RiskBadge label={opp.contract.riskLabel} />
        </div>
      </div>

      {/* Contract Details */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-gray-50 rounded-lg p-2 text-center">
          <p className="text-xs text-gray-400">Strike</p>
          <p className="font-bold text-gray-900 text-sm">${opp.contract.strike}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2 text-center">
          <p className="text-xs text-gray-400">Exp / DTE</p>
          <p className="font-bold text-gray-900 text-sm">
            {new Date(opp.contract.expiration).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </p>
          <p className="text-xs text-gray-500">{opp.contract.dte}d</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2 text-center">
          <p className="text-xs text-gray-400">Cost</p>
          <p className="font-bold text-purple-700 text-sm">${opp.costPerContract.toFixed(0)}</p>
          <p className="text-xs text-gray-500">${opp.contract.ask.toFixed(2)}/contract</p>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Est. Gain</span>
          <span className={`font-bold ${opp.estimatedGainPercent >= 100 ? 'text-green-700' : 'text-gray-800'}`}>
            {opp.estimatedGainPercent > 0 ? '+' : ''}{opp.estimatedGainPercent.toFixed(0)}%
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Breakeven</span>
          <span className="font-medium">${opp.contract.breakeven.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Delta</span>
          <span className="font-medium">{opp.contract.delta.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500">IV</span>
          <span className="font-medium">{(opp.contract.impliedVolatility * 100).toFixed(0)}%</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Target 1</span>
          <span className="font-medium">${opp.target1.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Target 2</span>
          <span className="font-medium">${opp.target2.toFixed(2)}</span>
        </div>
      </div>

      {/* Would Take */}
      <div className={`rounded-lg px-3 py-2 mb-3 text-xs font-medium ${wt.color}`}>
        {wt.label} — {opp.opportunityScore >= 70 ? 'Strong setup with clear trigger' : opp.opportunityScore >= 50 ? 'Decent setup, wait for confirmation' : 'Weak setup, avoid unless conditions improve'}
      </div>

      {/* 100%+ flag */}
      {opp.contract.is100PctPossible && (
        <div className={`flex items-center gap-1.5 text-xs mb-3 ${opp.contract.is100PctRealistic ? 'text-green-700' : 'text-orange-600'}`}>
          <AlertCircle size={12} />
          {opp.contract.is100PctRealistic ? '100%+ gain realistic with trend confirmation' : '100%+ possible but requires large move (lottery territory)'}
        </div>
      )}

      {/* Expandable explanation */}
      {expanded && (
        <div className="mb-3 p-3 bg-purple-50 rounded-lg text-xs text-purple-900 leading-relaxed animate-fade-in">
          <p className="font-semibold mb-1">📚 What this means (beginner-friendly):</p>
          <p>{opp.beginnerExplanation}</p>
          <div className="mt-2 pt-2 border-t border-purple-100 grid grid-cols-2 gap-1">
            <div><span className="text-purple-500">Entry: </span>{opp.entryTrigger.substring(0, 80)}...</div>
            <div><span className="text-purple-500">Stop: </span>${opp.stopInvalidation.toFixed(2)}</div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" className="flex-1" onClick={handleCreateAlert}>
          <Bell size={13} className="mr-1" /> Create Alert
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setExpanded(e => !e)}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </Button>
      </div>
    </Card>
  );
}

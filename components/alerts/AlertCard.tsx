'use client';
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { TradeAlert } from '@/lib/types';
import { useAlertsStore } from '@/store/alertsStore';
import { useJournalStore } from '@/store/journalStore';
import { useAuditStore } from '@/store/auditStore';
import { getAlertStateLabel, getAlertStateColor, formatTimeRemaining, buildAlert1Text, buildAlert2Text } from '@/lib/alerts';
import { TradeTicket } from './TradeTicket';
import { ChevronDown, ChevronUp, Clock, AlertTriangle } from 'lucide-react';

export function AlertCard({ alert }: { alert: TradeAlert }) {
  const [expanded, setExpanded] = useState(false);
  const [showTicket, setShowTicket] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const updateState = useAlertsStore(s => s.updateState);
  const addJournalEntry = useJournalStore(s => s.addEntry);
  const log = useAuditStore(s => s.log);

  useEffect(() => {
    if (!alert.tradeWindowExpiresAt) return;
    const t = setInterval(() => {
      setTimeLeft(formatTimeRemaining(alert.tradeWindowExpiresAt!));
    }, 1000);
    setTimeLeft(formatTimeRemaining(alert.tradeWindowExpiresAt));
    return () => clearInterval(t);
  }, [alert.tradeWindowExpiresAt]);

  const handleMarkReviewed = () => {
    updateState(alert.id, 'reviewed');
    log('Alert Reviewed', `Marked ${alert.symbol} ${alert.direction} $${alert.strike} as reviewed`, 'alert', alert.symbol);
  };

  const handleEntered = () => {
    updateState(alert.id, 'entered_manually');
    const journalId = addJournalEntry({
      alertId: alert.id,
      ticker: alert.symbol,
      contract: `${alert.symbol} $${alert.strike} ${alert.direction.toUpperCase()} ${alert.expiration}`,
      entryPrice: alert.currentAsk,
      setup: alert.triggerReason,
      triggerReason: `Alert triggered at $${alert.entryTriggerLevel.toFixed(2)}`,
      emotion: '',
      followedRules: true,
    });
    log('Trade Entered Manually', `Entered ${alert.symbol} ${alert.direction} $${alert.strike} @ $${alert.currentAsk}`, 'trade', alert.symbol);
  };

  const handleSkip = () => {
    updateState(alert.id, 'skipped');
    log('Alert Skipped', `Skipped ${alert.symbol} ${alert.direction} $${alert.strike}`, 'alert', alert.symbol);
  };

  const handleInvalidate = () => {
    updateState(alert.id, 'invalidated', 'Manually invalidated');
    log('Alert Invalidated', `Invalidated ${alert.symbol} ${alert.direction} $${alert.strike}`, 'alert', alert.symbol);
  };

  const isActive = ['watching', 'triggered', 'trade_window_open', 'reviewed'].includes(alert.state);
  const isUrgent = alert.state === 'trade_window_open' || alert.state === 'triggered';

  return (
    <Card className={isUrgent ? 'border-green-300 shadow-green-100 shadow-md' : ''}>
      {/* Urgent banner */}
      {isUrgent && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 text-xs text-green-800 leading-relaxed">
          <p className="font-bold mb-1">🚨 Alert 1: Trade Window Open</p>
          <p>{buildAlert1Text(alert)}</p>
          {alert.tradeWindowExpiresAt && (
            <p className="mt-1 font-semibold text-green-700">
              ⏰ Window closes in: {timeLeft}
            </p>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-gray-900 text-lg">{alert.symbol}</span>
            <Badge variant={alert.direction === 'call' ? 'success' : 'danger'}>
              {alert.direction.toUpperCase()}
            </Badge>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getAlertStateColor(alert.state)}`}>
              {getAlertStateLabel(alert.state)}
            </span>
          </div>
          <p className="text-sm text-gray-600">
            ${alert.strike} • Exp: {new Date(alert.expiration).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Max Entry</p>
          <p className="font-bold text-purple-700">${alert.suggestedMaxEntry.toFixed(2)}</p>
        </div>
      </div>

      {/* Key info */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
        <div className="bg-gray-50 rounded p-2">
          <p className="text-gray-400">Entry Trigger</p>
          <p className="font-medium">${alert.entryTriggerLevel.toFixed(2)}</p>
        </div>
        <div className="bg-gray-50 rounded p-2">
          <p className="text-gray-400">Invalidation</p>
          <p className="font-medium text-red-600">${alert.invalidationLevel.toFixed(2)}</p>
        </div>
        <div className="bg-gray-50 rounded p-2">
          <p className="text-gray-400">Current Ask</p>
          <p className="font-medium">${alert.currentAsk.toFixed(2)}</p>
        </div>
      </div>

      {/* Invalidation warning */}
      {isActive && (
        <div className="bg-red-50 border border-red-100 rounded-lg p-2 mb-3 text-xs text-red-700">
          <p className="font-semibold flex items-center gap-1 mb-1">
            <AlertTriangle size={11} /> Alert 2: Invalidation Conditions
          </p>
          <p className="text-red-600">{buildAlert2Text(alert)}</p>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="mb-3 p-3 bg-gray-50 rounded-lg text-xs space-y-1 animate-fade-in">
          <p><span className="text-gray-500">Trigger reason:</span> {alert.triggerReason}</p>
          {alert.notes && <p><span className="text-gray-500">Notes:</span> {alert.notes.substring(0, 200)}</p>}
          <p><span className="text-gray-500">Created:</span> {new Date(alert.createdAt).toLocaleString()}</p>
          {alert.triggeredAt && <p><span className="text-gray-500">Triggered:</span> {new Date(alert.triggeredAt).toLocaleString()}</p>}
        </div>
      )}

      {/* Ticket */}
      {showTicket && <TradeTicket alert={alert} />}

      {/* Actions */}
      {isActive && (
        <div className="flex flex-wrap gap-2 mb-2">
          <Button size="sm" variant="success" onClick={handleEntered}>✅ I Entered This</Button>
          <Button size="sm" variant="secondary" onClick={handleMarkReviewed}>👁 Mark Reviewed</Button>
          <Button size="sm" variant="ghost" onClick={handleSkip}>⏭ Skip</Button>
          <Button size="sm" variant="ghost" onClick={handleInvalidate}>❌ Invalidate</Button>
        </div>
      )}

      <div className="flex gap-2">
        <Button size="xs" variant="outline" onClick={() => setShowTicket(t => !t)}>
          {showTicket ? 'Hide' : 'Trade Ticket'}
        </Button>
        <Button size="xs" variant="ghost" onClick={() => setExpanded(e => !e)}>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          <span className="ml-1">Details</span>
        </Button>
      </div>
    </Card>
  );
}

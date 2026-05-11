'use client';
import { useState } from 'react';
import type { TradeAlert } from '@/lib/types';
import { buildTradeTicketText, buildBrokerLink } from '@/lib/alerts';
import { useSettingsStore } from '@/store/settingsStore';
import { Button } from '@/components/ui/Button';
import { Copy, Check, ExternalLink } from 'lucide-react';

const CHECKLIST_ITEMS = [
  'I checked the bid/ask spread',
  'I checked the volume and open interest',
  'I checked the expiration date',
  'I calculated my max risk',
  'I understand this option can go to zero',
  'I am manually confirming this trade in my broker app',
];

export function TradeTicket({ alert, contracts = 1 }: { alert: TradeAlert; contracts?: number }) {
  const brokerName = useSettingsStore(s => s.brokerName) || 'your broker';
  const [checklist, setChecklist] = useState<boolean[]>(new Array(CHECKLIST_ITEMS.length).fill(false));
  const [copied, setCopied] = useState(false);
  const [numContracts, setNumContracts] = useState(contracts);

  const allChecked = checklist.every(Boolean);

  const handleCopy = async () => {
    const text = buildTradeTicketText(alert, numContracts, brokerName);
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleCheck = (i: number) => {
    setChecklist(c => c.map((v, idx) => idx === i ? !v : v));
  };

  const maxLoss = (alert.suggestedMaxEntry * 100 * numContracts);
  const targetSell = alert.suggestedMaxEntry * 2;
  const brokerLink = buildBrokerLink(brokerName, alert.symbol);

  return (
    <div className="bg-gray-900 text-white rounded-xl p-4 mb-4 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-700">
        <div>
          <h3 className="font-bold text-purple-400 text-base">📋 Manual Trade Ticket</h3>
          <p className="text-xs text-gray-400">
            Broker: <span className="text-purple-300 font-medium">{brokerName}</span> — review and enter manually
          </p>
        </div>
      </div>

      {/* Trade Details */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <p className="text-gray-400 text-xs">Ticker</p>
          <p className="font-bold text-white text-lg">{alert.symbol}</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Action</p>
          <p className={`font-bold text-lg ${alert.direction === 'call' ? 'text-green-400' : 'text-red-400'}`}>
            BUY {alert.direction.toUpperCase()}
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Strike</p>
          <p className="font-semibold">${alert.strike}</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Expiration</p>
          <p className="font-semibold">{new Date(alert.expiration).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Limit Price</p>
          <p className="font-bold text-yellow-400">${alert.suggestedMaxEntry.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Contracts</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setNumContracts(n => Math.max(1, n - 1))} className="w-5 h-5 bg-gray-700 rounded text-center">−</button>
            <span className="font-bold">{numContracts}</span>
            <button onClick={() => setNumContracts(n => n + 1)} className="w-5 h-5 bg-gray-700 rounded text-center">+</button>
          </div>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Max Loss</p>
          <p className="font-bold text-red-400">${maxLoss.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs">Target Sell</p>
          <p className="font-bold text-green-400">${targetSell.toFixed(2)}+</p>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-2 mb-4 text-xs">
        <p className="text-gray-400">Stop/Invalidation:</p>
        <p className="text-red-300">{alert.symbol} below ${alert.invalidationLevel.toFixed(2)}</p>
      </div>

      {/* Checklist */}
      <div className="mb-4">
        <p className="text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">Pre-Trade Checklist</p>
        {CHECKLIST_ITEMS.map((item, i) => (
          <label key={i} className="flex items-start gap-2 py-1.5 cursor-pointer group">
            <div
              onClick={() => toggleCheck(i)}
              className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                checklist[i] ? 'bg-purple-600 border-purple-600' : 'border-gray-500 group-hover:border-purple-400'
              }`}
            >
              {checklist[i] && <Check size={10} className="text-white" />}
            </div>
            <span className={`text-xs ${checklist[i] ? 'text-gray-400 line-through' : 'text-gray-200'}`}>{item}</span>
          </label>
        ))}
      </div>

      {!allChecked && (
        <p className="text-xs text-yellow-400 mb-3 flex items-center gap-1">
          ⚠️ Complete all checklist items before entering
        </p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={copied ? 'success' : 'outline'}
          onClick={handleCopy}
          className="flex-1 bg-transparent border-gray-600 text-gray-200 hover:bg-gray-700 hover:border-gray-500"
        >
          {copied ? <Check size={13} className="mr-1" /> : <Copy size={13} className="mr-1" />}
          {copied ? 'Copied!' : 'Copy Ticket'}
        </Button>
        <a
          href={brokerLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-600 text-xs text-gray-200 hover:bg-gray-700 transition-colors"
        >
          <ExternalLink size={12} />
          Open {brokerName.length > 12 ? 'Broker' : brokerName}
        </a>
      </div>

      <p className="text-xs text-gray-500 mt-3 text-center">
        ⚠️ NOT FINANCIAL ADVICE. Always confirm manually in {brokerName}. Options can go to zero.
      </p>
    </div>
  );
}

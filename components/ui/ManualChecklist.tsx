'use client';
import { useTradeviStore, ManualCheck } from '@/store/tradeviStore';

interface Props {
  symbol: string;
}

const CHECKS: { key: keyof ManualCheck; label: string }[] = [
  { key: 'choch', label: 'CHOCH (Change of Character)' },
  { key: 'bos', label: 'BOS (Break of Structure)' },
  { key: 'fvg', label: 'FVG (Fair Value Gap)' },
  { key: 'vwap', label: 'VWAP reclaim' },
  { key: 'marketAligned', label: 'Market aligned' },
];

const DEFAULT_CHECKS: ManualCheck = {
  choch: false,
  bos: false,
  fvg: false,
  vwap: false,
  marketAligned: false,
};

export default function ManualChecklist({ symbol }: Props) {
  const { manualChecks, setManualCheck, resetManualChecks } = useTradeviStore();
  const checks = manualChecks[symbol] ?? DEFAULT_CHECKS;
  const metCount = Object.values(checks).filter(Boolean).length;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">Manual {metCount} of 5</span>
        <button
          onClick={() => resetManualChecks(symbol)}
          className="text-xs text-gray-600 hover:text-gray-400 underline"
        >
          Reset
        </button>
      </div>
      {CHECKS.map(({ key, label }) => (
        <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={checks[key]}
            onChange={(e) => setManualCheck(symbol, key, e.target.checked)}
            className="w-4 h-4 rounded border-[#2a2a2a] bg-[#1a1a1a] accent-green-500"
          />
          <span className={checks[key] ? 'text-white' : 'text-gray-500'}>{label}</span>
        </label>
      ))}
    </div>
  );
}

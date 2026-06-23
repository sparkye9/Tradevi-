'use client';
import { useTradeviStore } from '@/store/tradeviStore';

export default function ModeToggle({ compact = false }: { compact?: boolean }) {
  const { tradingMode, setTradingMode } = useTradeviStore();

  if (compact) {
    return (
      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#161616] border border-[#242424]">
        <button
          onClick={() => setTradingMode('puts')}
          className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
            tradingMode === 'puts'
              ? 'bg-red-500/20 text-red-400 border border-red-500/40'
              : 'text-gray-600 hover:text-gray-400'
          }`}
        >
          PUTS
        </button>
        <button
          onClick={() => setTradingMode('both')}
          className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
            tradingMode === 'both'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
              : 'text-gray-600 hover:text-gray-400'
          }`}
        >
          BOTH
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest">Trading Mode</span>
      <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0d0d0d] border border-[#1e1e1e]">
        <button
          onClick={() => setTradingMode('puts')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold tracking-wide transition-all ${
            tradingMode === 'puts'
              ? 'bg-red-500/15 text-red-400 border border-red-500/30 shadow-sm'
              : 'text-gray-600 hover:text-gray-300'
          }`}
        >
          PUTS ONLY
        </button>
        <button
          onClick={() => setTradingMode('both')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold tracking-wide transition-all ${
            tradingMode === 'both'
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
              : 'text-gray-600 hover:text-gray-300'
          }`}
        >
          BOTH
        </button>
      </div>
    </div>
  );
}

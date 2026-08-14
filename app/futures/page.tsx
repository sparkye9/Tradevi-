import TrendBiasStack from '@/components/futures/TrendBiasStack';
import SessionBias from '@/components/futures/SessionBias';

export default function FuturesPage() {
  return (
    <div className="space-y-10 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Futures</h1>
        <p className="text-sm text-gray-500 mt-1">
          Structure stack and overnight session read. Confirm on TradingView before acting.
        </p>
      </div>
      <TrendBiasStack />
      <div className="border-t border-[#1a1a1a] pt-8">
        <SessionBias />
      </div>
    </div>
  );
}

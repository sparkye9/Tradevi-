import TrendBiasStack from '@/components/futures/TrendBiasStack';
import SessionBias from '@/components/futures/SessionBias';

export default function FuturesPage() {
  return (
    <div className="space-y-10 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Futures</h1>
        <p className="text-sm text-gray-500 mt-1">
          MNQ-first workstation. Swing entry / stop / TP1 / TP2 from the daily dealing range, plus a
          15-minute intraday map that refreshes every 10 minutes. Confirm on TradingView before you act.
        </p>
      </div>
      <TrendBiasStack />
      <div className="border-t border-[#1a1a1a] pt-8">
        <SessionBias />
      </div>
    </div>
  );
}

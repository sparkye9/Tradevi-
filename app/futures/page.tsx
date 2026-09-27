import LearnBox from '@/components/ui/LearnBox';
import Link from 'next/link';
import TrendBiasStack from '@/components/futures/TrendBiasStack';
import SessionBias from '@/components/futures/SessionBias';

export default function FuturesPage() {
  return (
    <div className="space-y-10 max-w-6xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Futures</h1>
          <p className="text-sm text-gray-500 mt-1">
            MNQ-first workstation. Swing entry / stop / TP1 / TP2 from the daily dealing range, plus a
            15-minute intraday map that refreshes every 10 minutes. Confirm on TradingView before you act.
          </p>
        </div>
        <Link
          href="/futures/backtest"
          className="shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold border border-tv-purple/40 bg-tv-purple/10 text-tv-purple hover:bg-tv-purple/20 transition-colors"
        >
          🧪 Backtest
        </Link>
      </div>
      <LearnBox
        summary="a top-down trend read on the index futures, from weekly down to 4-hour."
        items={[
          { term: 'Futures', text: 'Contracts that track an index like the Nasdaq (MNQ) or S&P 500 (MES). They trade almost 24 hours a day, so they show how the market is leaning before stocks open.' },
          { term: 'HH / HL', text: 'Higher highs and higher lows = uptrend. Lower highs and lower lows = downtrend. Neither = range.' },
          { term: 'Stack', text: 'Checking the weekly, daily and 4-hour trend together. When all three agree, the trend is “stacked”.' },
          { term: 'Premium / Discount', text: 'Upper or lower half of the recent range. In an uptrend you want to buy in discount, not chase premium.' },
          { term: 'Invalidation', text: 'The price that proves the idea wrong. Every setup here shows one.' },
          { term: 'TP1 / TP2', text: 'First and second take-profit targets.' },
        ]}
        learnHref="/learn"
      />

      <TrendBiasStack />
      <div className="border-t border-[#1a1a1a] pt-8">
        <SessionBias />
      </div>
    </div>
  );
}

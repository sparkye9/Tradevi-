'use client';
import LearnBox from '@/components/ui/LearnBox';
import StocksSubnav from '@/components/stocks/StocksSubnav';
import ChainViewer from '@/components/options/ChainViewer';
import { useFinvizScan } from '@/hooks/useFinvizScan';

export default function OptionsPage() {
  // The stock scanner's LOOK names show up as quick picks above the chain.
  const { looks } = useFinvizScan();
  const picks = looks.map(({ q }) => q.symbol).slice(0, 8);

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Options chains</h1>
          <p className="text-sm text-gray-500 mt-1">
            Look up any stock or ETF and read its calls and puts strike by strike. Tap a contract for a plain-English
            breakdown of cost, breakeven and risk.
          </p>
        </div>
        <StocksSubnav />
      </div>

      <LearnBox
        summary="every call or put you could buy on one stock, for one expiration date."
        items={[
          { term: 'Call / Put', text: 'A call profits if the stock goes up; a put profits if it goes down. One contract controls 100 shares.' },
          { term: 'Strike', text: 'The price the option lets you buy (call) or sell (put) the stock at.' },
          { term: 'Expiration', text: 'The date the option ends. After this it is gone — worth something or worth zero.' },
          { term: 'Price', text: 'The midpoint between bid and ask, quoted per share. Multiply by 100 for the real cost.' },
          { term: 'ITM', text: 'In the money: the option already has built-in value. Shaded rows in the table.' },
          { term: 'Breakeven', text: 'Where the stock must be at expiration for you to get your money back.' },
          { term: 'Delta', text: 'Roughly how much the option moves for a $1 move in the stock (0.50 ≈ 50¢).' },
          { term: 'Volume / Open int.', text: 'Contracts traded today / contracts still open. Bigger numbers make it easier to get in and out.' },
          { term: 'Spread', text: 'The gap between bid and ask. Tight is good; wide quietly costs you money on every trade.' },
        ]}
        learnHref="/learn#chain"
      />

      <ChainViewer picks={picks} />
    </div>
  );
}

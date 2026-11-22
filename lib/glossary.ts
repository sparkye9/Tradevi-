/**
 * One plain-English glossary for the whole app. Each entry is a single
 * sentence a beginner can act on, plus an optional worked example. The
 * <Term> component shows these where the word appears, and the How to use
 * page lists them all, so a definition is written once.
 */
export interface GlossaryEntry {
  term: string;
  short: string;
  example?: string;
}

export const GLOSSARY = {
  put: { term: 'Put option', short: 'A contract that gains value when the stock or ETF falls below its strike price. The most you can lose is what you paid.', example: 'A SPY 600 put pays off if SPY ends below $600 (minus what you paid).' },
  strike: { term: 'Strike', short: 'The price the put lets you sell at. The further the market falls below it, the more the put is worth at expiration.' },
  expiration: { term: 'Expiration', short: 'The last day the option exists. After that it is worth only how far the price is below the strike, or nothing.' },
  dte: { term: 'DTE (days to expiration)', short: 'How many calendar days are left before the option expires. More days cost more but give the idea more time.' },
  premium: { term: 'Premium', short: 'The price of the option, quoted per share. One contract covers 100 shares, so multiply by 100 for the real cost.', example: 'A premium of $1.42 costs $142 per contract.' },
  cost: { term: 'Cost', short: 'What one contract costs at the ask price: premium × 100. It is also the most you can lose on that contract.' },
  bidask: { term: 'Bid / ask', short: 'The bid is what buyers pay now; the ask is what sellers want. You usually buy at the ask and sell at the bid.' },
  spread: { term: 'Spread', short: 'The gap between bid and ask, as a share of the price. A wide spread means you lose money just getting in and out.' },
  mid: { term: 'Mid', short: 'Halfway between bid and ask. A reference price only; you may not get filled there.' },
  breakeven: { term: 'Breakeven', short: 'The price the underlying must finish below at expiration for this put to make money if held to the end: strike minus premium.' },
  delta: { term: 'Delta (Δ)', short: 'Roughly how much the put gains when the underlying falls $1. It is negative for puts.', example: 'Delta −0.25: if SPY falls $1, this put gains about $0.25 per share ($25 per contract).' },
  gamma: { term: 'Gamma (Γ)', short: 'How fast delta grows as the price moves. High gamma means the put speeds up quickly in a sharp drop.' },
  theta: { term: 'Theta (Θ)', short: 'How much value the put loses each day just from time passing, if nothing else changes.', example: 'Theta −$3/day: waiting a week costs about $21 per contract.' },
  vega: { term: 'Vega', short: 'How much the put gains if implied volatility (fear) rises by 1 point. Puts bought while fear is low benefit most.' },
  iv: { term: 'IV (implied volatility)', short: 'How big a move the option price is expecting. High IV makes options expensive; it usually jumps when markets fall.' },
  oi: { term: 'Open interest (OI)', short: 'How many contracts of this option exist. More open interest usually means easier, cheaper trading.' },
  volume: { term: 'Volume', short: 'How many contracts traded today. Zero volume can mean a stale price.' },
  moneyness: { term: 'OTM / ATM / ITM', short: 'Out of the money: strike below the price (cheaper, needs a bigger fall). At the money: strike near the price. In the money: strike above the price.' },
  leaps: { term: 'LEAPS', short: 'Options with more than about four months left. More expensive, slower to lose value, more time for a thesis to play out.' },
  vix: { term: 'VIX', short: 'The market’s “fear gauge”: the volatility the S&P 500 options market expects over the next 30 days. Under 15 is calm; above 30 is fear.' },
  vixTerm: { term: 'VIX term structure (VIX/VIX3M)', short: 'Near-term fear compared with 3-month fear. Above 1 means short-term panic is higher than usual (“inverted”).' },
  realizedVol: { term: 'Realized volatility', short: 'How much the price has actually been moving lately, as a yearly percentage.' },
  skew: { term: 'SKEW index', short: 'How expensive crash protection is compared with normal options. High means traders are paying up for tail protection.' },
  breadth: { term: 'Market breadth', short: 'How many stocks or sectors are joining the move. A market rising on a few big names with most others falling is fragile.' },
  oas: { term: 'Credit spread (OAS)', short: 'The extra yield investors demand to lend to riskier companies instead of the government. Widening spreads mean lenders are getting nervous.' },
  yieldCurve: { term: 'Yield curve', short: 'Long-term interest rates minus short-term rates. Below zero (inverted) has often come before recessions.' },
  stress: { term: 'Financial stress index', short: 'A Fed index of stress across funding, credit and markets. Above 0 is more stress than normal.' },
  distribution: { term: 'Distribution days', short: 'Days the index falls on higher volume than the day before: a sign of big investors selling.' },
  drawdown: { term: 'Drawdown', short: 'How far the price is below its recent high. 10% is a correction; 20% is a bear market.' },
  riskScore: { term: 'Crash Risk Score', short: 'A 0–100 count of how many defined warning signs are present. Higher means more warning signs. It is not the chance of a crash.' },
  coverage: { term: 'Coverage', short: 'How much of the score is backed by real data. Missing data is left out, never counted as “safe”.' },
  regime: { term: 'Market regime', short: 'The stage the market seems to be in, from Normal through Early Warning, Pre-Crash Watch and Breakdown to Panic.' },
  preCrash: { term: 'PRE-CRASH WATCH', short: 'Several independent warning signs at once while fear is still low and prices are near their highs: the cheapest time to buy protection, if it is going to be needed.' },
  lateEntry: { term: 'Late entry', short: 'Fear has already arrived and puts are expensive. Buying now often means paying for a drop that already happened.' },
  quality: { term: 'Quality score', short: 'How good the contract itself is (price, liquidity, time decay, payoff), 0–100. It is not the chance of winning.' },
  setup: { term: 'Setup score', short: 'How well this contract fits today’s market conditions, 0–100. It is not the chance of winning.' },
  watch: { term: 'STRONG WATCH / WATCH', short: 'Contracts worth a closer look today. WAIT means maybe later; AVOID means poor value; IN A FALL means the market is already falling: puts can still pay, but they cost more and a bounce can wipe them out.' },
  noTrade: { term: 'NO TRADE', short: 'Nothing passed the safety filters. Not trading is a valid answer; the scanner does not force a pick.' },
  theoretical: { term: 'THEORETICAL', short: 'Prices calculated from a model using past prices and the VIX, because real historical option quotes are not loaded. Not real past trades.' },
  inSample: { term: 'In-sample / out-of-sample', short: 'In-sample is the history a rule was tuned on; out-of-sample is history it never saw. Out-of-sample results are the honest test.' },
  walkForward: { term: 'Walk-forward test', short: 'Tune the rule on one period, test it on the next unseen period, then roll forward. It mimics using the rule in real time.' },
  falseAlarm: { term: 'False alarm', short: 'The rule fired but no 10% drop followed within the test window.' },
  leadTime: { term: 'Lead time', short: 'How many days before the drop the warning first appeared.' },
  profitFactor: { term: 'Profit factor', short: 'Total winnings divided by total losses. Above 1 made money overall.' },
  winRate: { term: 'Win rate', short: 'Share of trades that made money. Put strategies often win rarely but big.' },
  noHindsight: { term: 'No Hindsight', short: 'The replay hides everything after the date you are on, so you decide with only what was known then.' },
} satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;

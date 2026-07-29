// lib/futuresBias.ts — the one futures-bias read, shared by Home and
// Futures Guide. Previously this 9-factor engine only lived inside
// mini-futures/page.tsx, so Home had to run its own thin 3-factor version
// to show a market-mood snippet. Now they read the same number.

import type { FinvizFuture } from './finviz';

export type Bias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface Driver { label: string; positive: boolean }

export interface BiasRead {
  bias: Bias;
  score: number;
  confidence: number;
  drivers: Driver[];
  risks: Driver[];
  playbook: string[];
  vixNote: string;
}

export function computeFuturesBias(futures: FinvizFuture[]): BiasRead {
  const get = (sym: string) => futures.find((f) => f.symbol === sym);

  const es  = get('ES');
  const nq  = get('NQ');
  const ym  = get('YM');
  const rty = get('RTY');
  const vix = get('VIX');
  const gc  = get('GC');
  const oil = get('OIL');
  const tnx = get('TNX');
  const dxy = get('DXY');

  let score = 0;
  const drivers: Driver[] = [];
  const risks: Driver[] = [];

  if (es?.direction === 'up')  { score += 1; drivers.push({ label: 'ES Green', positive: true }); }
  if (nq?.direction === 'up')  { score += 1; drivers.push({ label: 'NQ Green', positive: true }); }
  if (ym?.direction === 'up')  { score += 1; drivers.push({ label: 'YM Green', positive: true }); }
  if (rty?.direction === 'up') { score += 1; drivers.push({ label: 'RTY Green — breadth positive', positive: true }); }

  if (gc?.direction === 'down' && es?.direction === 'up') {
    drivers.push({ label: 'Gold Falling — risk-on confirmed', positive: true });
  }
  if (vix?.direction === 'down') {
    drivers.push({ label: 'VIX Falling — fear decreasing', positive: true });
  }

  if (vix !== undefined && vix.changePercent !== null && vix.changePercent > 2) {
    score -= 1;
    risks.push({ label: `VIX +${vix.changePercent.toFixed(1)}% — fear spiking`, positive: false });
  } else if (vix?.direction === 'up') {
    risks.push({ label: 'VIX Rising — elevated caution', positive: false });
  }

  if (dxy !== undefined && dxy.changePercent !== null && dxy.changePercent > 0.5) {
    score -= 1;
    risks.push({ label: `DXY +${dxy.changePercent.toFixed(2)}% — dollar strength headwind`, positive: false });
  }

  if (tnx !== undefined && tnx.changePercent !== null && tnx.changePercent > 1) {
    score -= 1;
    risks.push({ label: `10Y Yield +${tnx.changePercent.toFixed(2)}% — rates rising sharply`, positive: false });
  }

  if (oil?.direction === 'down') {
    risks.push({ label: 'Oil Weak — demand concerns', positive: false });
  }

  if (gc?.direction === 'up' && (es?.direction === 'down' || es?.direction === 'flat')) {
    risks.push({ label: 'Gold Rising with ES Weak — risk-off rotation', positive: false });
  }

  if (dxy !== undefined && dxy.changePercent !== null && dxy.changePercent > 0 && dxy.changePercent <= 0.5) {
    risks.push({ label: `DXY +${dxy.changePercent.toFixed(2)}% — mild dollar strength, watch`, positive: false });
  }

  let bias: Bias = 'NEUTRAL';
  if (score >= 3) bias = 'BULLISH';
  if (score <= -3) bias = 'BEARISH';

  const confidence =
    bias === 'BULLISH' ? Math.min(97, 55 + (score - 2) * 21) :
    bias === 'BEARISH' ? Math.min(97, 55 + (Math.abs(score) - 2) * 30) :
    Math.max(35, 50 - Math.abs(score) * 5);

  const vixPrice = vix?.price ?? null;
  const vixNote =
    vixPrice === null ? 'VIX unavailable' :
    vixPrice < 15    ? `VIX ${vixPrice.toFixed(2)} — Low volatility. Trending conditions, hold runners longer.` :
    vixPrice < 20    ? `VIX ${vixPrice.toFixed(2)} — Moderate volatility. Normal range day. Respect levels, take partials.` :
    vixPrice < 28    ? `VIX ${vixPrice.toFixed(2)} — Elevated volatility. Trade smaller. Take profits quickly.` :
                       `VIX ${vixPrice.toFixed(2)} — High fear. Expect large swings. Consider staying flat or scalping only.`;

  const playbook: string[] = [];
  const indexCount = [es, nq, ym, rty].filter((f) => f?.direction === 'up').length;
  const alignment = `${indexCount}/4 index futures aligned`;

  if (bias === 'BULLISH') {
    playbook.push(`${alignment} — look for pullbacks to VWAP or yesterday's high as long entries.`);
    if (vixPrice !== null && vixPrice < 15)
      playbook.push('Low VIX: trend day conditions. Hold runners. Move stop to breakeven at +4 pts on ES.');
    else if (vixPrice !== null && vixPrice >= 20)
      playbook.push('Elevated VIX despite bullish bias — expect volatility. Take first partial at +4 pts. Do not hold through reversals.');
    else
      playbook.push('Take first partial at +4 pts ES / +1% on options. Let the rest run to measured target.');
    playbook.push('If ES opens above prior day high, wait for a 1-min pullback and retest before entering long.');
    playbook.push('Watch RTY. If small caps lag while ES leads, be cautious — breadth is narrowing.');
  } else if (bias === 'BEARISH') {
    playbook.push(`${alignment} — look for dead-cat bounces into VWAP or prior day low as short entries.`);
    if (vixPrice !== null && vixPrice >= 20)
      playbook.push('High VIX + bearish bias — do not chase breakdowns. Wait for a bounce, then enter short.');
    else
      playbook.push('Take first partial at -4 pts ES. Trail stop tight — bear days can reverse fast near the close.');
    playbook.push('If ES gaps down, wait for the first 5-min candle to close before shorting the breakdown.');
    playbook.push('Watch RTY — if small caps hold green while ES is red, the short may fail. Wait for full alignment.');
  } else {
    playbook.push(`${alignment} — no clean edge. Do NOT force a trade at the open.`);
    playbook.push('Wait for the opening range (first 5–15 min) to form. Trade the ORB break in whichever direction wins.');
    playbook.push('Mixed futures = chop risk. Reduce size. Widen stops slightly or sit out entirely.');
    if (vixPrice !== null && vixPrice >= 20)
      playbook.push('High VIX + mixed futures = dangerous conditions. Consider passing until a clear trend shows after 10 AM.');
  }

  return { bias, score, confidence, drivers, risks, playbook, vixNote };
}

/** One-word "market mood" label for the Home screen — Trend/Range/Reversal read on top of bias + VIX. */
export function deriveMarketMood(read: BiasRead): string {
  if (read.bias === 'NEUTRAL') return 'Range Day';
  if (read.confidence >= 75) return read.bias === 'BULLISH' ? 'Trend Day — Bullish' : 'Trend Day — Bearish';
  return read.bias === 'BULLISH' ? 'Leaning Bullish' : 'Leaning Bearish';
}

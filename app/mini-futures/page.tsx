'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import type { FinvizFuture, FinvizResult } from '@/lib/finviz';

// ─── Bias engine ─────────────────────────────────────────────────────────────

type Bias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

interface Driver { label: string; positive: boolean }

interface BiasRead {
  bias: Bias;
  score: number;
  confidence: number;
  drivers: Driver[];
  risks: Driver[];
  playbook: string[];
  vixNote: string;
}

function computeBias(futures: FinvizFuture[]): BiasRead {
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

  // ── Positive signals (+1 each) ──
  if (es?.direction === 'up')  { score += 1; drivers.push({ label: 'ES Green', positive: true }); }
  if (nq?.direction === 'up')  { score += 1; drivers.push({ label: 'NQ Green', positive: true }); }
  if (ym?.direction === 'up')  { score += 1; drivers.push({ label: 'YM Green', positive: true }); }
  if (rty?.direction === 'up') { score += 1; drivers.push({ label: 'RTY Green — breadth positive', positive: true }); }

  // Gold falling while stocks up = clean risk-on
  if (gc?.direction === 'down' && es?.direction === 'up') {
    drivers.push({ label: 'Gold Falling — risk-on confirmed', positive: true });
  }

  // VIX falling = bullish confirmation
  if (vix?.direction === 'down') {
    drivers.push({ label: 'VIX Falling — fear decreasing', positive: true });
  }

  // ── Negative signals (-1 each) ──
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

  // Oil weak = macro risk signal
  if (oil?.direction === 'down') {
    risks.push({ label: 'Oil Weak — demand concerns', positive: false });
  }

  // Gold rising while stocks flat/down = risk-off
  if (gc?.direction === 'up' && (es?.direction === 'down' || es?.direction === 'flat')) {
    risks.push({ label: 'Gold Rising with ES Weak — risk-off rotation', positive: false });
  }

  // DXY rising but not enough to penalize score — still a note
  if (dxy !== undefined && dxy.changePercent !== null && dxy.changePercent > 0 && dxy.changePercent <= 0.5) {
    risks.push({ label: `DXY +${dxy.changePercent.toFixed(2)}% — mild dollar strength, watch`, positive: false });
  }

  // ── Bias determination ──
  let bias: Bias = 'NEUTRAL';
  if (score >= 3) bias = 'BULLISH';
  if (score <= -3) bias = 'BEARISH';

  // ── Confidence ──
  // Max score = +4, max negative = -3. Map to 50–97%
  const confidence =
    bias === 'BULLISH' ? Math.min(97, 55 + (score - 2) * 21) :
    bias === 'BEARISH' ? Math.min(97, 55 + (Math.abs(score) - 2) * 30) :
    Math.max(35, 50 - Math.abs(score) * 5);

  // ── VIX environment note ──
  const vixPrice = vix?.price ?? null;
  const vixNote =
    vixPrice === null ? 'VIX unavailable' :
    vixPrice < 15    ? `VIX ${vixPrice.toFixed(2)} — Low volatility. Trending conditions, hold runners longer.` :
    vixPrice < 20    ? `VIX ${vixPrice.toFixed(2)} — Moderate volatility. Normal range day. Respect levels, take partials.` :
    vixPrice < 28    ? `VIX ${vixPrice.toFixed(2)} — Elevated volatility. Trade smaller. Take profits quickly.` :
                       `VIX ${vixPrice.toFixed(2)} — High fear. Expect large swings. Consider staying flat or scalping only.`;

  // ── Playbook ──
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

// ─── Instrument card ──────────────────────────────────────────────────────────

const DISPLAY_NAMES: Record<string, string> = {
  GC: 'Gold', OIL: 'Oil', TNX: '10Y Yield', DXY: 'DXY',
};

function InstrumentCard({ f }: { f: FinvizFuture }) {
  const isVix = f.symbol === 'VIX';
  const isTnx = f.symbol === 'TNX';
  const isDxy = f.symbol === 'DXY';

  const isUp   = f.direction === 'up';
  const isDown = f.direction === 'down';

  // VIX, TNX, DXY rising = bearish for equities
  const invertedSentiment = isVix || isTnx || isDxy;
  const bullish = invertedSentiment ? isDown : isUp;
  const bearish = invertedSentiment ? isUp   : isDown;

  const borderColor = bullish ? 'border-emerald-500/30' : bearish ? 'border-red-500/30' : 'border-[#2a2a2a]';
  const chgColor    = bullish ? 'text-emerald-400' : bearish ? 'text-red-400' : 'text-gray-500';
  const lean        = bullish ? 'BULL' : bearish ? 'BEAR' : 'FLAT';
  const leanColor   = bullish
    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    : bearish
    ? 'bg-red-500/20 text-red-400 border-red-500/30'
    : 'bg-[#1e1e1e] text-gray-500 border-[#2a2a2a]';

  const displaySymbol = DISPLAY_NAMES[f.symbol] ?? f.symbol;

  return (
    <div className={`bg-[#111111] border rounded-xl p-3 flex flex-col gap-1.5 transition-all hover:bg-[#161616] ${borderColor}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-white font-bold font-mono text-base leading-tight">{displaySymbol}</div>
          <div className="text-[10px] text-gray-600 truncate max-w-[90px]">{f.name}</div>
        </div>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${leanColor}`}>{lean}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-white font-mono text-xs font-semibold">
          {f.price !== null ? f.price.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '--'}
        </span>
        <span className={`font-mono text-xs font-semibold ${chgColor}`}>
          {f.changePercent !== null ? `${f.changePercent >= 0 ? '+' : ''}${f.changePercent.toFixed(2)}%` : '--'}
        </span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MiniFuturesPage() {
  const [data, setData] = useState<FinvizResult<FinvizFuture> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch('/api/finviz/futures');
        const json = await res.json();
        setData(json);
      } catch {
        setData({ data: [], sourceError: 'Fetch failed', lastUpdated: new Date().toISOString() });
      }
      setLoading(false);
    }
    load();
  }, []);

  const futures = data?.data ?? [];
  const read = futures.length > 0 ? computeBias(futures) : null;

  const biasBg =
    read?.bias === 'BULLISH' ? 'border-emerald-500/40 bg-emerald-500/10' :
    read?.bias === 'BEARISH' ? 'border-red-500/40 bg-red-500/10' :
    'border-amber-500/30 bg-amber-500/5';
  const biasColor =
    read?.bias === 'BULLISH' ? 'text-emerald-400' :
    read?.bias === 'BEARISH' ? 'text-red-400' :
    'text-amber-400';
  const confBarColor =
    read?.bias === 'BULLISH' ? 'bg-emerald-500' :
    read?.bias === 'BEARISH' ? 'bg-red-500' :
    'bg-amber-500';

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Futures Guide</h1>
        <p className="text-sm text-gray-500 mt-1">9-factor bias engine — ES · NQ · YM · RTY · VIX · Gold · Oil · 10Y · DXY</p>
      </div>

      <div className="flex items-center gap-4">
        {data && <SourceTag source={data.source ?? 'Yahoo Finance'} lastUpdated={data.lastUpdated} />}
        {loading && <span className="text-gray-500 text-sm animate-pulse">Loading...</span>}
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      {/* ── Bias card ── */}
      {read && (
        <div className={`border rounded-2xl p-5 ${biasBg}`}>
          <div className="flex items-end justify-between mb-3">
            <div>
              <div className={`text-3xl font-black font-mono tracking-tight ${biasColor}`}>
                {read.bias} BIAS
              </div>
              <div className={`text-lg font-bold font-mono mt-0.5 ${biasColor}`}>
                {read.confidence}% Confidence
              </div>
            </div>
            <div className={`text-4xl font-black font-mono ${biasColor}`}>
              {read.bias === 'BULLISH' ? '▲' : read.bias === 'BEARISH' ? '▼' : '◆'}
            </div>
          </div>
          {/* Confidence bar */}
          <div className="w-full bg-[#1a1a1a] rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${confBarColor}`}
              style={{ width: `${read.confidence}%` }}
            />
          </div>
          <div className="text-xs text-gray-600 mt-1.5">Score: {read.score > 0 ? '+' : ''}{read.score}</div>
        </div>
      )}

      {/* ── Instrument grid ── */}
      {loading && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
          {[0,1,2,3,4,5,6,7,8].map((i) => (
            <div key={i} className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-3 animate-pulse h-16" />
          ))}
        </div>
      )}
      {futures.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
          {futures.map((f) => <InstrumentCard key={f.symbol} f={f} />)}
        </div>
      )}

      {/* ── Drivers & Risks ── */}
      {read && (read.drivers.length > 0 || read.risks.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {read.drivers.length > 0 && (
            <div className="bg-[#111111] border border-emerald-500/20 rounded-xl p-4 space-y-2">
              <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Drivers</div>
              {read.drivers.map((d, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="text-emerald-400 shrink-0">✓</span> {d.label}
                </div>
              ))}
            </div>
          )}
          {read.risks.length > 0 && (
            <div className="bg-[#111111] border border-red-500/20 rounded-xl p-4 space-y-2">
              <div className="text-xs font-bold text-red-400 uppercase tracking-widest">Risks</div>
              {read.risks.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="text-amber-400 shrink-0">⚠</span> {r.label}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── VIX environment ── */}
      {read && (
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-xl p-4">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">VIX Environment</div>
          <p className="text-sm text-gray-300">{read.vixNote}</p>
        </div>
      )}

      {/* ── Playbook ── */}
      {read && (
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-3">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Today&apos;s Playbook</div>
          <ul className="space-y-2">
            {read.playbook.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                <span className={`mt-0.5 shrink-0 font-bold ${biasColor}`}>→</span>
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-gray-700">
        Bias from overnight futures. Key levels and execution on your prop platform + TradingView.
      </p>
    </div>
  );
}

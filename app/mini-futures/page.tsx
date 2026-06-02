'use client';
import { useEffect, useState } from 'react';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import type { FinvizFuture, FinvizResult } from '@/lib/finviz';

// ─── Bias engine ─────────────────────────────────────────────────────────────

type Bias = 'LONG' | 'SHORT' | 'MIXED';

interface TradingRead {
  bias: Bias;
  biasReason: string;
  vixEnv: 'LOW' | 'MODERATE' | 'HIGH' | null;
  vixNote: string;
  goldSignal: string;
  playbook: string[];
  alignment: number; // 0-4 contracts aligned
}

function computeRead(futures: FinvizFuture[]): TradingRead {
  const get = (sym: string) => futures.find((f) => f.symbol === sym);

  const es  = get('ES');
  const nq  = get('NQ');
  const ym  = get('YM');
  const rty = get('RTY');
  const vix = get('VIX');
  const gc  = get('GC');

  const indexContracts = [es, nq, ym, rty].filter(Boolean) as FinvizFuture[];
  const upCount   = indexContracts.filter((f) => f.direction === 'up').length;
  const downCount = indexContracts.filter((f) => f.direction === 'down').length;

  let bias: Bias = 'MIXED';
  let alignment = 0;
  if (upCount >= 3)   { bias = 'LONG';  alignment = upCount; }
  if (downCount >= 3) { bias = 'SHORT'; alignment = downCount; }

  const biasReason =
    bias === 'LONG'  ? `${upCount}/4 index futures green — buyers in control overnight` :
    bias === 'SHORT' ? `${downCount}/4 index futures red — sellers in control overnight` :
    `${upCount} up · ${downCount} down — no clean directional edge`;

  // VIX environment
  const vixPrice = vix?.price ?? null;
  let vixEnv: TradingRead['vixEnv'] = null;
  let vixNote = 'VIX unavailable';
  if (vixPrice !== null) {
    if (vixPrice < 15) {
      vixEnv = 'LOW';
      vixNote = `VIX ${vixPrice.toFixed(2)} — low vol. Trending conditions. Ride momentum, hold runners longer.`;
    } else if (vixPrice < 20) {
      vixEnv = 'MODERATE';
      vixNote = `VIX ${vixPrice.toFixed(2)} — moderate vol. Normal range days. Respect key levels, take partials.`;
    } else {
      vixEnv = 'HIGH';
      vixNote = `VIX ${vixPrice.toFixed(2)} — elevated vol. Expect chop and reversals. Trade smaller, take profits fast.`;
    }
  }

  // Gold signal
  const gcDir = gc?.direction;
  const esDir = es?.direction;
  let goldSignal = 'Gold data unavailable';
  if (gcDir && esDir) {
    if (gcDir === 'up' && esDir === 'up')
      goldSignal = 'Gold ▲ + ES ▲ — mixed signal. Possible flight-to-safety alongside equities. Watch for fakeout.';
    else if (gcDir === 'down' && esDir === 'up')
      goldSignal = 'Gold ▼ + ES ▲ — clean risk-on. Money rotating into equities. Long bias confirmed.';
    else if (gcDir === 'up' && esDir === 'down')
      goldSignal = 'Gold ▲ + ES ▼ — risk-off. Defensive positioning. Short bias confirmed.';
    else if (gcDir === 'down' && esDir === 'down')
      goldSignal = 'Gold ▼ + ES ▼ — broad selling. No safe-haven bid either. Proceed with caution.';
    else
      goldSignal = 'Flat reading on Gold and/or ES — no divergence signal.';
  }

  // Playbook
  const playbook: string[] = [];

  if (bias === 'LONG') {
    playbook.push('Bias is LONG. Look for pullbacks into VWAP or prior session highs as entries.');
    if (vixEnv === 'LOW')
      playbook.push('Low VIX — trend day likely. Hold runners, move stop to breakeven once up 4–6 pts on ES.');
    else if (vixEnv === 'MODERATE')
      playbook.push('Moderate VIX — take first partial at +4 pts, let rest run to measured target.');
    else if (vixEnv === 'HIGH')
      playbook.push('High VIX — long bias but expect volatility. Enter on confirmed ORB break. Take full exit quickly, do not hold through reversals.');
    playbook.push('If ES opens above prior day high, wait for a 1-min retest before entering long.');
    playbook.push('Avoid chasing opens. Let price come to you — first 5 min is noise.');
  } else if (bias === 'SHORT') {
    playbook.push('Bias is SHORT. Look for dead-cat bounces into VWAP or prior day low as short entries.');
    if (vixEnv === 'LOW')
      playbook.push('Low VIX but bearish futures — could be a slow grind lower. Short breakdown of ORB low, trail stop tight.');
    else if (vixEnv === 'MODERATE')
      playbook.push('Moderate VIX — fade bounces to VWAP. First partial at -4 pts, let rest run.');
    else if (vixEnv === 'HIGH')
      playbook.push('High VIX + short bias — volatile downside. Don\'t chase gaps down. Wait for a bounce, then enter short.');
    playbook.push('If ES gaps down, wait for the first 5-min candle to close before shorting the breakdown.');
    playbook.push('Watch RTY — if small caps hold green while ES is red, short may fail. Wait for full alignment.');
  } else {
    playbook.push('No clear bias. Do NOT force a trade at the open.');
    playbook.push('Wait for the opening range (first 5–15 min) to form. Trade the ORB breakout in whichever direction wins.');
    playbook.push('Flat futures often lead to chop — reduce size, widen stops slightly, or sit out.');
    if (vixEnv === 'HIGH')
      playbook.push('High VIX with mixed futures = dangerous conditions. Consider passing entirely until a clear trend emerges.');
  }

  return { bias, biasReason, vixEnv, vixNote, goldSignal, playbook, alignment };
}

// ─── Contract card ───────────────────────────────────────────────────────────

function ContractCard({ f }: { f: FinvizFuture }) {
  const isVix = f.symbol === 'VIX';
  const isUp = f.direction === 'up';
  const isDown = f.direction === 'down';

  const bullish = isVix ? isDown : isUp;
  const bearish = isVix ? isUp : isDown;

  const borderColor = bullish
    ? 'border-emerald-500/30'
    : bearish
    ? 'border-red-500/30'
    : 'border-[#2a2a2a]';

  const chgColor = bullish ? 'text-emerald-400' : bearish ? 'text-red-400' : 'text-gray-500';
  const lean = bullish ? 'LONG' : bearish ? 'SHORT' : 'NEUTRAL';
  const leanColor = bullish
    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    : bearish
    ? 'bg-red-500/20 text-red-400 border-red-500/30'
    : 'bg-[#1e1e1e] text-gray-500 border-[#2a2a2a]';

  const displaySymbol = f.symbol === 'GC' ? 'Gold' : f.symbol;

  return (
    <div className={`bg-[#111111] border rounded-2xl p-4 flex flex-col gap-2 transition-all hover:bg-[#161616] ${borderColor}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-white font-bold font-mono text-xl">{displaySymbol}</div>
          <div className="text-xs text-gray-600 mt-0.5 truncate">{f.name}</div>
        </div>
        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${leanColor}`}>{lean}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-white font-mono font-semibold">
          {f.price !== null ? f.price.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '--'}
        </span>
        <span className={`font-mono text-sm font-semibold ${chgColor}`}>
          {f.changePercent !== null
            ? `${f.changePercent >= 0 ? '+' : ''}${f.changePercent.toFixed(2)}%`
            : '--'}
        </span>
      </div>
      {isVix && (
        <div className="text-xs text-gray-600">Rising VIX = bearish for equities</div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

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
  const read = futures.length > 0 ? computeRead(futures) : null;

  const biasBg =
    read?.bias === 'LONG'  ? 'border-emerald-500/30 bg-emerald-500/10' :
    read?.bias === 'SHORT' ? 'border-red-500/30 bg-red-500/10' :
    'border-amber-500/30 bg-amber-500/10';
  const biasText =
    read?.bias === 'LONG'  ? 'text-emerald-400' :
    read?.bias === 'SHORT' ? 'text-red-400' :
    'text-amber-400';

  const vixBadge =
    read?.vixEnv === 'LOW'      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
    read?.vixEnv === 'MODERATE' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
    read?.vixEnv === 'HIGH'     ? 'bg-red-500/20 text-red-400 border-red-500/30' :
    'bg-[#1e1e1e] text-gray-500 border-[#2a2a2a]';

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Futures Trading Guide</h1>
        <p className="text-sm text-gray-500 mt-1">Live bias + actionable playbook for ES, NQ, YM, RTY</p>
      </div>

      <div className="flex items-center gap-4">
        {data && <SourceTag source={data.source ?? 'Yahoo Finance'} lastUpdated={data.lastUpdated} />}
        {loading && <span className="text-gray-500 text-sm animate-pulse">Loading...</span>}
      </div>

      {data?.sourceError && <DataUnavailable reason={data.sourceError} />}

      {/* ── Overall Bias ── */}
      {read && (
        <div className={`border rounded-2xl p-5 ${biasBg}`}>
          <div className="flex items-center gap-3 mb-2">
            <span className={`text-3xl font-black font-mono ${biasText}`}>{read.bias}</span>
            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${biasText} border-current bg-transparent`}>
              {read.alignment}/4 aligned
            </span>
          </div>
          <p className="text-sm text-gray-400">{read.biasReason}</p>
        </div>
      )}

      {/* ── Skeleton ── */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[0,1,2,3,4,5].map((i) => (
            <div key={i} className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-4 animate-pulse">
              <div className="h-6 w-12 bg-[#222] rounded mb-2" />
              <div className="h-3 w-20 bg-[#1a1a1a] rounded mb-3" />
              <div className="h-5 w-24 bg-[#222] rounded" />
            </div>
          ))}
        </div>
      )}

      {/* ── Contract cards ── */}
      {futures.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {futures.map((f) => <ContractCard key={f.symbol} f={f} />)}
        </div>
      )}

      {/* ── VIX Environment ── */}
      {read && (
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">VIX Environment</span>
            {read.vixEnv && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${vixBadge}`}>{read.vixEnv}</span>
            )}
          </div>
          <p className="text-sm text-gray-300">{read.vixNote}</p>
        </div>
      )}

      {/* ── Gold / Equities Signal ── */}
      {read && (
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-4 space-y-2">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Gold · Risk Signal</span>
          <p className="text-sm text-gray-300">{read.goldSignal}</p>
        </div>
      )}

      {/* ── Playbook ── */}
      {read && (
        <div className="bg-[#111111] border border-[#1e1e1e] rounded-2xl p-5 space-y-3">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Today&apos;s Playbook</span>
          <ul className="space-y-2">
            {read.playbook.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                <span className={`mt-0.5 shrink-0 ${
                  read.bias === 'LONG' ? 'text-emerald-400' :
                  read.bias === 'SHORT' ? 'text-red-400' : 'text-amber-400'
                }`}>→</span>
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-gray-700">
        Bias is derived from overnight futures direction. Execution and key levels confirmed on your prop platform + TradingView.
      </p>
    </div>
  );
}

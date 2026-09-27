'use client';
import { useEffect, useMemo, useState } from 'react';

type Kind = 'call' | 'put';

function plAtExpiry(kind: Kind, strike: number, premium: number, price: number): number {
  const intrinsic = kind === 'call' ? Math.max(0, price - strike) : Math.max(0, strike - price);
  return intrinsic - premium;
}

function money(n: number): string {
  const sign = n < 0 ? '-' : n > 0 ? '+' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  step = 1,
  min = 0,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-gray-300">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full bg-tv-bg border border-tv-border rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-tv-purple outline-none"
      />
      <span className="block text-[11px] text-tv-muted">{hint}</span>
    </label>
  );
}

/** Buy-a-call / buy-a-put payoff at expiration, with a draggable "what if" price. */
export default function PayoffCalculator() {
  const [kind, setKind] = useState<Kind>('call');
  const [stock, setStock] = useState(100);
  const [strike, setStrike] = useState(105);
  const [premium, setPremium] = useState(2);
  const [contracts, setContracts] = useState(1);
  const [whatIf, setWhatIf] = useState(110);

  // "Try it in the payoff calculator" on the Options page passes a real contract in the URL.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const k = q.get('kind');
    const s = parseFloat(q.get('stock') ?? '');
    const K = parseFloat(q.get('strike') ?? '');
    const p = parseFloat(q.get('premium') ?? '');
    if (k === 'call' || k === 'put') setKind(k);
    if (s > 0) setStock(s);
    if (K > 0) setStrike(K);
    if (p >= 0 && Number.isFinite(p)) setPremium(p);
    if (s > 0) setWhatIf(k === 'put' ? s * 0.95 : s * 1.05);
  }, []);

  const valid = stock > 0 && strike > 0 && premium >= 0 && contracts >= 1;
  const mult = 100 * (Number.isFinite(contracts) ? Math.floor(contracts) : 1);
  const cost = premium * mult;
  const breakeven = kind === 'call' ? strike + premium : strike - premium;
  const maxProfit = kind === 'call' ? 'Unlimited (in theory)' : money((strike - premium) * mult);

  const lo = Math.max(0, Math.min(stock, strike) * 0.7);
  const hi = Math.max(stock, strike) * 1.3;
  const whatIfClamped = Math.min(hi, Math.max(lo, whatIf));
  const whatIfPL = plAtExpiry(kind, strike, premium, whatIfClamped) * mult;

  const markers = [
    { p: stock, label: 'Today', color: '#6EA8FF' },
    { p: strike, label: 'Strike', color: '#8B93A7' },
    { p: breakeven, label: 'Breakeven', color: '#F5C15C' },
  ];

  const chart = useMemo(() => {
    if (!valid) return null;
    const W = 560;
    const H = 220;
    const pad = { l: 56, r: 12, t: 12, b: 28 };
    const N = 80;
    const pts = Array.from({ length: N + 1 }, (_, i) => {
      const p = lo + ((hi - lo) * i) / N;
      return { p, v: plAtExpiry(kind, strike, premium, p) * mult };
    });
    const vMin = Math.min(...pts.map((d) => d.v), -cost * 1.1);
    const vMax = Math.max(...pts.map((d) => d.v), cost * 0.5);
    const x = (p: number) => pad.l + ((p - lo) / (hi - lo)) * (W - pad.l - pad.r);
    const y = (v: number) => pad.t + ((vMax - v) / (vMax - vMin || 1)) * (H - pad.t - pad.b);
    const line = pts.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(d.p).toFixed(1)},${y(d.v).toFixed(1)}`).join(' ');
    return { W, H, pad, x, y, line, vMin, vMax };
  }, [valid, lo, hi, kind, strike, premium, mult, cost]);

  return (
    <div className="card space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {(['call', 'put'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
              kind === k
                ? k === 'call'
                  ? 'bg-tv-green/15 text-tv-green border-tv-green/40'
                  : 'bg-tv-red/15 text-tv-red border-tv-red/40'
                : 'text-gray-500 border-tv-border hover:text-gray-200'
            }`}
          >
            Buy a {k}
          </button>
        ))}
        <span className="text-xs text-tv-muted">
          {kind === 'call' ? 'You profit if the stock rises above breakeven.' : 'You profit if the stock falls below breakeven.'}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <NumberField label="Stock price now" hint="What the shares trade at today" value={stock} onChange={setStock} step={0.5} />
        <NumberField label="Strike price" hint={`Price you can ${kind === 'call' ? 'buy' : 'sell'} at`} value={strike} onChange={setStrike} step={0.5} />
        <NumberField label="Premium (per share)" hint="Option price as quoted" value={premium} onChange={setPremium} step={0.05} />
        <NumberField label="Contracts" hint="Each = 100 shares" value={contracts} onChange={setContracts} min={1} />
      </div>

      {!valid ? (
        <p className="text-sm text-tv-amber">Enter positive numbers to see the payoff.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="You pay (max loss)" value={money(-cost)} tone="red" note={`${premium} × 100 × ${mult / 100}`} />
            <Stat label="Breakeven at expiry" value={`$${breakeven.toFixed(2)}`} note={kind === 'call' ? 'strike + premium' : 'strike − premium'} />
            <Stat label="Max profit" value={maxProfit} tone="green" />
            <Stat
              label="Moneyness today"
              value={
                stock === strike ? 'At the money' : (kind === 'call' ? stock > strike : stock < strike) ? 'In the money' : 'Out of the money'
              }
            />
          </div>

          {chart && (
            <div className="space-y-2">
              <svg viewBox={`0 0 ${chart.W} ${chart.H}`} className="w-full h-auto" role="img" aria-label="Profit and loss at expiration">
                {/* zero line */}
                <line x1={chart.pad.l} x2={chart.W - chart.pad.r} y1={chart.y(0)} y2={chart.y(0)} stroke="#3a4156" strokeDasharray="4 4" />
                <text x={chart.pad.l - 6} y={chart.y(0) + 4} textAnchor="end" fontSize="10" fill="#8B93A7">$0</text>
                <text x={chart.pad.l - 6} y={chart.y(chart.vMax) + 8} textAnchor="end" fontSize="10" fill="#22E38A">
                  {money(Math.round(chart.vMax))}
                </text>
                {chart.y(chart.vMin) - chart.y(0) > 16 && (
                  <text x={chart.pad.l - 6} y={chart.y(chart.vMin)} textAnchor="end" fontSize="10" fill="#FF4D6A">
                    {money(Math.round(chart.vMin))}
                  </text>
                )}
                {/* strike + breakeven + today (labelled in the legend below) */}
                {markers.map((m) =>
                  m.p >= lo && m.p <= hi ? (
                    <line
                      key={m.label}
                      x1={chart.x(m.p)}
                      x2={chart.x(m.p)}
                      y1={chart.pad.t}
                      y2={chart.H - chart.pad.b}
                      stroke={m.color}
                      strokeOpacity="0.6"
                      strokeDasharray={m.label === 'Breakeven' ? '5 3' : undefined}
                    />
                  ) : null,
                )}
                <text x={chart.pad.l} y={chart.H - 10} fontSize="10" fill="#8B93A7">${lo.toFixed(0)}</text>
                <text x={chart.W - chart.pad.r} y={chart.H - 10} textAnchor="end" fontSize="10" fill="#8B93A7">
                  ${hi.toFixed(0)}
                </text>
                <text x={(chart.pad.l + chart.W - chart.pad.r) / 2} y={chart.H - 10} textAnchor="middle" fontSize="10" fill="#8B93A7">
                  stock price at expiration →
                </text>
                <path d={chart.line} fill="none" stroke={kind === 'call' ? '#22E38A' : '#FF4D6A'} strokeWidth="2.5" />
                <circle cx={chart.x(whatIfClamped)} cy={chart.y(whatIfPL)} r="5" fill="#fff" stroke="#8B7CFF" strokeWidth="2" />
              </svg>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                {markers.map((m) => (
                  <span key={m.label} className="inline-flex items-center gap-1.5 text-gray-400">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: m.color }} />
                    {m.label} <span className="font-mono text-white">${m.p.toFixed(2)}</span>
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5 text-gray-400">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-white" /> your “what if” price
                </span>
              </div>

              <div className="rounded-xl border border-tv-border bg-tv-bg/50 p-3 space-y-2">
                <label className="flex items-center justify-between text-xs text-gray-300">
                  <span>
                    What if the stock is at <span className="font-mono text-white">${whatIfClamped.toFixed(2)}</span> on expiration day?
                  </span>
                  <span className={`font-mono font-bold ${whatIfPL > 0 ? 'text-tv-green' : whatIfPL < 0 ? 'text-tv-red' : 'text-white'}`}>
                    {money(whatIfPL)}
                  </span>
                </label>
                <input
                  type="range"
                  min={lo}
                  max={hi}
                  step={(hi - lo) / 200}
                  value={whatIfClamped}
                  onChange={(e) => setWhatIf(parseFloat(e.target.value))}
                  className="w-full accent-[#8B7CFF]"
                />
                <p className="text-[11px] text-tv-muted">
                  This is the value <em>at expiration</em>. Before then the option also has time value, so its real price will
                  be different. Commissions and the bid/ask spread are not included.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'red' | 'green' }) {
  return (
    <div className="rounded-xl border border-tv-border bg-tv-bg/50 p-3">
      <div className="label">{label}</div>
      <div className={`font-mono font-bold mt-1 ${tone === 'red' ? 'text-tv-red' : tone === 'green' ? 'text-tv-green' : 'text-white'}`}>
        {value}
      </div>
      {note && <div className="text-[10px] text-gray-600 mt-0.5 font-mono">{note}</div>}
    </div>
  );
}

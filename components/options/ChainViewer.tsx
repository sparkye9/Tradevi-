'use client';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Search, AlertTriangle, CheckCircle2, Calculator } from 'lucide-react';
import DataUnavailable from '@/components/ui/DataUnavailable';
import SourceTag from '@/components/ui/SourceTag';
import TradingViewButton from '@/components/ui/TradingViewButton';
import type { ChainLeg, ChainResult, ChainRow } from '@/lib/optionChain';

type Side = 'call' | 'put';

const POPULAR = ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'AMD', 'AMZN', 'META'];

function mid(leg: ChainLeg | null): number | null {
  if (!leg) return null;
  if (leg.bid != null && leg.ask != null && leg.ask > 0) return (leg.bid + leg.ask) / 2;
  return leg.last ?? null;
}

function spreadPct(leg: ChainLeg | null): number | null {
  const m = mid(leg);
  if (!leg || m == null || m <= 0 || leg.bid == null || leg.ask == null) return null;
  return ((leg.ask - leg.bid) / m) * 100;
}

function spreadLabel(pct: number | null): { text: string; cls: string } {
  if (pct == null) return { text: '—', cls: 'text-tv-muted' };
  if (pct < 5) return { text: 'Tight', cls: 'text-tv-green' };
  if (pct < 15) return { text: 'OK', cls: 'text-tv-amber' };
  return { text: 'Wide', cls: 'text-tv-red' };
}

function daysUntil(exp: string): number {
  // Options stop trading at the 4:00 PM ET close (~20:00 UTC).
  const close = Date.parse(`${exp}T20:00:00Z`);
  return Math.max(0, Math.ceil((close - Date.now()) / 86_400_000));
}

function fmtExp(exp: string): string {
  const d = new Date(`${exp}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const usd = (n: number | null, digits = 2) =>
  n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const int = (n: number | null) => (n == null ? '—' : n.toLocaleString('en-US'));

function isItm(side: Side, strike: number, underlying: number | null): boolean {
  if (underlying == null) return false;
  return side === 'call' ? strike < underlying : strike > underlying;
}

export default function ChainViewer({ picks }: { picks: string[] }) {
  const [input, setInput] = useState('SPY');
  const [symbol, setSymbol] = useState('SPY');
  const [expiration, setExpiration] = useState<string | null>(null);
  const [side, setSide] = useState<Side>('call');
  const [data, setData] = useState<ChainResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  // Only the newest request may update the table (fast clicking between tickers).
  const requestId = useRef(0);

  const load = useCallback(async (sym: string, exp: string | null) => {
    const id = ++requestId.current;
    setLoading(true);
    setSelected(null);
    try {
      const qs = new URLSearchParams({ symbol: sym });
      if (exp) qs.set('expiration', exp);
      const res = await fetch(`/api/options/chain?${qs}`);
      const json = (await res.json()) as ChainResult;
      if (id !== requestId.current) return;
      setData(json);
      if (!exp && json.expiration) setExpiration(json.expiration);
    } catch {
      if (id !== requestId.current) return;
      setData({
        symbol: sym,
        underlying: null,
        expirations: [],
        expiration: null,
        rows: [],
        hasGreeks: false,
        source: '',
        lastUpdated: new Date().toISOString(),
        sourceError: 'Fetch failed',
      });
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  // Links like /options?symbol=AAPL (from the stock cards) open that chain directly.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('symbol')?.toUpperCase();
    if (fromUrl && /^[A-Z][A-Z0-9.\-]{0,9}$/.test(fromUrl)) {
      setInput(fromUrl);
      setSymbol(fromUrl);
    }
  }, []);

  useEffect(() => {
    load(symbol, expiration);
    // expiration changes are loaded explicitly in pickExpiration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, load]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const sym = input.trim().toUpperCase();
    if (!sym) return;
    setExpiration(null);
    setSymbol(sym);
    if (sym === symbol) load(sym, null);
  }

  function pickSymbol(sym: string) {
    setInput(sym);
    setExpiration(null);
    setSymbol(sym);
  }

  function pickExpiration(exp: string) {
    setExpiration(exp);
    load(symbol, exp);
  }

  const explainerRef = useRef<HTMLDivElement>(null);

  function selectStrike(strike: number) {
    setSelected(strike);
    // On narrow screens the explainer sits below the table — bring it into view.
    if (window.innerWidth < 1280) {
      requestAnimationFrame(() => explainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }

  const underlying = data?.underlying ?? null;
  const rows = data?.rows ?? [];
  // Index where the stock price sits between strikes, for the "stock is here" divider.
  const atmIndex = useMemo(() => {
    if (underlying == null) return -1;
    const i = rows.findIndex((r) => r.strike >= underlying);
    return i === -1 ? rows.length : i;
  }, [rows, underlying]);

  const selectedRow: ChainRow | undefined = rows.find((r) => r.strike === selected);
  const days = data?.expiration ? daysUntil(data.expiration) : null;
  const showGreeks = data?.hasGreeks ?? false;

  return (
    <div className="space-y-4">
      {/* Ticker lookup */}
      <div className="card space-y-3">
        <form onSubmit={submit} className="flex gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-tv-muted" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              placeholder="Ticker, e.g. AAPL"
              aria-label="Ticker symbol"
              maxLength={10}
              className="w-full bg-tv-bg border border-tv-border rounded-lg pl-9 pr-3 py-2 text-white font-mono text-sm uppercase focus:border-tv-purple outline-none"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-tv-purple/80 hover:bg-tv-purple text-white transition-colors"
          >
            Load chain
          </button>
        </form>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-tv-muted mr-1">Popular:</span>
          {POPULAR.map((s) => (
            <button
              key={s}
              onClick={() => pickSymbol(s)}
              className={`px-2.5 py-1 rounded-full text-xs font-mono border transition-colors ${
                symbol === s ? 'border-tv-purple/60 bg-tv-purple/15 text-tv-purple' : 'border-tv-border text-gray-400 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {picks.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-tv-green mr-1">Scanner LOOK names:</span>
            {picks.map((s) => (
              <button
                key={s}
                onClick={() => pickSymbol(s)}
                className={`px-2.5 py-1 rounded-full text-xs font-mono border transition-colors ${
                  symbol === s ? 'border-tv-green/60 bg-tv-green/15 text-tv-green' : 'border-tv-green/30 text-tv-green/80 hover:text-tv-green'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && !data ? (
        <div className="skeleton h-72 w-full rounded-2xl" />
      ) : data?.sourceError ? (
        <DataUnavailable symbol={symbol} reason={data.sourceError} />
      ) : data ? (
        <>
          {/* Summary + expiration */}
          <div className="card flex flex-wrap items-end gap-x-6 gap-y-3">
            <div>
              <div className="label">Stock</div>
              <div className="text-2xl font-black text-white font-mono">{data.symbol}</div>
            </div>
            <div>
              <div className="label">Stock price</div>
              <div className="text-2xl font-bold text-white font-mono">{usd(underlying)}</div>
            </div>
            <label className="block">
              <span className="label block mb-1">Expiration</span>
              <select
                value={data.expiration ?? ''}
                onChange={(e) => pickExpiration(e.target.value)}
                className="bg-tv-bg border border-tv-border rounded-lg px-3 py-2 text-white text-sm focus:border-tv-purple outline-none"
              >
                {data.expirations.slice(0, 24).map((exp) => (
                  <option key={exp} value={exp}>
                    {fmtExp(exp)} · {daysUntil(exp)} day{daysUntil(exp) === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex rounded-lg border border-tv-border overflow-hidden">
              {(['call', 'put'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setSide(s);
                    setSelected(null);
                  }}
                  className={`px-4 py-2 text-sm font-semibold transition-colors ${
                    side === s
                      ? s === 'call'
                        ? 'bg-tv-green/15 text-tv-green'
                        : 'bg-tv-red/15 text-tv-red'
                      : 'text-gray-500 hover:text-gray-200'
                  }`}
                >
                  {s === 'call' ? 'Calls (bet up)' : 'Puts (bet down)'}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {loading && <span className="text-xs text-tv-muted animate-pulse">Loading…</span>}
              <SourceTag source={data.source} lastUpdated={data.lastUpdated} />
            </div>
          </div>

          {days != null && days <= 7 && (
            <div className="flex items-start gap-2 rounded-xl border border-tv-amber/30 bg-tv-amber/5 p-3 text-xs text-gray-300">
              <AlertTriangle size={14} className="text-tv-amber shrink-0 mt-0.5" />
              <span>
                This expiration is only <strong className="text-white">{days} day{days === 1 ? '' : 's'}</strong> away. Short-dated
                options lose value very fast (time decay) and can swing wildly — pick a later date to practise.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
            {/* Chain table */}
            <div className="card p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-widest text-tv-muted border-b border-tv-border">
                      <th className="py-2.5 px-3 font-medium" title="The price you can buy (call) or sell (put) the stock at">Strike</th>
                      <th className="py-2.5 px-3 font-medium" title="Midpoint between bid and ask, per share">Price</th>
                      <th className="py-2.5 px-3 font-medium" title="Price × 100 shares">Cost / contract</th>
                      <th className="py-2.5 px-3 font-medium" title="Stock price needed at expiration to break even">Breakeven</th>
                      {showGreeks && <th className="py-2.5 px-3 font-medium" title="Approx. option move per $1 stock move">Delta</th>}
                      <th className="py-2.5 px-3 font-medium hidden md:table-cell" title="Contracts traded today">Volume</th>
                      <th className="py-2.5 px-3 font-medium hidden md:table-cell" title="Contracts currently open">Open int.</th>
                      <th className="py-2.5 px-3 font-medium" title="Gap between bid and ask — tight is better">Spread</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const leg = side === 'call' ? row.call : row.put;
                      const m = mid(leg);
                      const itm = isItm(side, row.strike, underlying);
                      const be = m == null ? null : side === 'call' ? row.strike + m : row.strike - m;
                      const sp = spreadLabel(spreadPct(leg));
                      const isSel = selected === row.strike;
                      return (
                        <Fragment key={row.strike}>
                          {i === atmIndex && underlying != null && (
                            <tr>
                              <td colSpan={showGreeks ? 8 : 7} className="px-3 py-1 bg-tv-blue/10 border-y border-tv-blue/30">
                                <span className="text-[11px] font-semibold text-tv-blue">
                                  ▲ In the money above · stock is at {usd(underlying)} · out of the money below ▼
                                </span>
                              </td>
                            </tr>
                          )}
                          <tr
                            onClick={() => leg && selectStrike(row.strike)}
                            className={`border-b border-tv-border/60 transition-colors ${leg ? 'cursor-pointer' : 'opacity-40'} ${
                              isSel ? 'bg-tv-purple/15' : itm ? 'bg-white/[0.03] hover:bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                            }`}
                          >
                            <td className="py-2 px-3 font-mono font-bold text-white">
                              {usd(row.strike, row.strike % 1 === 0 ? 0 : 2)}
                              {itm && <span className="ml-1.5 text-[9px] font-sans font-semibold text-tv-green/80 align-middle">ITM</span>}
                            </td>
                            <td className="py-2 px-3 font-mono text-gray-200">{usd(m)}</td>
                            <td className="py-2 px-3 font-mono text-white">{m == null ? '—' : usd(m * 100, 0)}</td>
                            <td className="py-2 px-3 font-mono text-gray-300">{usd(be)}</td>
                            {showGreeks && <td className="py-2 px-3 font-mono text-tv-blue">{leg?.delta != null ? leg.delta.toFixed(2) : '—'}</td>}
                            <td className="py-2 px-3 font-mono text-gray-400 hidden md:table-cell">{int(leg?.volume ?? null)}</td>
                            <td className="py-2 px-3 font-mono text-gray-400 hidden md:table-cell">{int(leg?.openInterest ?? null)}</td>
                            <td className={`py-2 px-3 text-xs font-semibold ${sp.cls}`}>{sp.text}</td>
                          </tr>
                        </Fragment>
                      );
                    })}
                    {underlying != null && atmIndex === rows.length && rows.length > 0 && (
                      <tr>
                        <td colSpan={showGreeks ? 8 : 7} className="px-3 py-1 bg-tv-blue/10 text-[11px] font-semibold text-tv-blue">
                          Stock is at {usd(underlying)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="px-3 py-2 text-[11px] text-tv-muted">
                Tap a row to see what that contract means. Prices are per share — one contract is 100 shares.
                {!showGreeks && ' Delta and theta are not available from this data source; check them on your broker.'}
              </p>
            </div>

            {/* Explainer for the selected contract */}
            <div ref={explainerRef} className="scroll-mt-4">
              <ContractExplainer
                symbol={data.symbol}
                side={side}
                row={selectedRow}
                underlying={underlying}
                days={days}
                expiration={data.expiration}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ContractExplainer({
  symbol,
  side,
  row,
  underlying,
  days,
  expiration,
}: {
  symbol: string;
  side: Side;
  row: ChainRow | undefined;
  underlying: number | null;
  days: number | null;
  expiration: string | null;
}) {
  const leg = row ? (side === 'call' ? row.call : row.put) : null;
  const m = mid(leg);
  if (!row || !leg || m == null) {
    return (
      <div className="card space-y-2 text-sm text-tv-muted self-start">
        <div className="label">Contract explained</div>
        <p>Pick a strike in the table and this panel will explain the trade in plain English: what it costs, where it breaks even, and what to watch out for.</p>
      </div>
    );
  }

  const cost = m * 100;
  const be = side === 'call' ? row.strike + m : row.strike - m;
  const movePct = underlying ? ((be - underlying) / underlying) * 100 : null;
  const itm = isItm(side, row.strike, underlying);
  const sp = spreadPct(leg);

  const checks: { ok: boolean; text: string }[] = [];
  if (sp != null) {
    checks.push(
      sp < 15
        ? { ok: true, text: `Bid/ask spread is ${sp < 5 ? 'tight' : 'reasonable'} (${sp.toFixed(0)}% of the price).` }
        : { ok: false, text: `Wide spread (${sp.toFixed(0)}% of the price) — you lose money just getting in and out.` },
    );
  }
  if (leg.openInterest != null) {
    checks.push(
      leg.openInterest >= 500
        ? { ok: true, text: `${leg.openInterest.toLocaleString()} contracts open — easy to trade.` }
        : { ok: false, text: `Only ${leg.openInterest.toLocaleString()} contracts open — may be hard to sell later.` },
    );
  }
  if (days != null) {
    checks.push(
      days > 21
        ? { ok: true, text: `${days} days until expiration gives the idea time to work.` }
        : { ok: false, text: `${days} day${days === 1 ? '' : 's'} left — time decay eats the price fastest in the final weeks.` },
    );
  }
  if (movePct != null) {
    const need = side === 'call' ? movePct : -movePct;
    checks.push(
      need <= 3
        ? { ok: true, text: `Needs only a ${Math.max(0, need).toFixed(1)}% ${side === 'call' ? 'rise' : 'drop'} to break even at expiration.` }
        : { ok: false, text: `Needs a ${need.toFixed(1)}% ${side === 'call' ? 'rise' : 'drop'} by expiration just to break even.` },
    );
  }

  const calcHref = `/learn?${new URLSearchParams({
    kind: side,
    stock: String(underlying ?? row.strike),
    strike: String(row.strike),
    premium: m.toFixed(2),
  })}#calculator`;

  return (
    <div className="card space-y-3 self-start">
      <div className="label">Contract explained</div>
      <div className="font-mono text-lg text-white">
        {symbol} {expiration ? fmtExp(expiration) : ''}{' '}
        <span className="text-tv-purple">${row.strike}</span>{' '}
        <span className={side === 'call' ? 'text-tv-green' : 'text-tv-red'}>{side === 'call' ? 'Call' : 'Put'}</span>
      </div>
      <p className="text-sm text-gray-300 leading-relaxed">
        Buying this {side} costs about <strong className="text-white">{usd(cost, 0)}</strong> ({usd(m)} × 100). It gives you the
        right to {side === 'call' ? 'buy' : 'sell'} 100 shares of {symbol} at <strong className="text-white">${row.strike}</strong>.
        It is <strong className="text-white">{itm ? 'in the money' : 'out of the money'}</strong> right now.
      </p>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg border border-tv-border p-2">
          <div className="label">Breakeven</div>
          <div className="font-mono text-white mt-0.5">{usd(be)}</div>
        </div>
        <div className="rounded-lg border border-tv-border p-2">
          <div className="label">Max loss</div>
          <div className="font-mono text-tv-red mt-0.5">{usd(cost, 0)}</div>
        </div>
      </div>
      <ul className="space-y-1.5">
        {checks.map((c) => (
          <li key={c.text} className="flex items-start gap-2 text-xs leading-relaxed">
            {c.ok ? (
              <CheckCircle2 size={14} className="text-tv-green shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle size={14} className="text-tv-amber shrink-0 mt-0.5" />
            )}
            <span className="text-gray-300">{c.text}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          href={calcHref}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-tv-purple/80 hover:bg-tv-purple rounded-lg px-3 py-2"
        >
          <Calculator size={13} /> Try it in the payoff calculator
        </Link>
        <TradingViewButton symbol={symbol} label={`Chart ${symbol}`} />
      </div>
      <p className="text-[11px] text-gray-600">Education only. Verify on your broker&apos;s chain and chart before any trade.</p>
    </div>
  );
}


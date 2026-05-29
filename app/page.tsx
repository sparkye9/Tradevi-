'use client';

import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { RefreshCw, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { fetchQuote, fetchNews, type QuoteData } from '@/lib/apiClient';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// ── Types ─────────────────────────────────────────────────────────────────────

type ActiveMode = 'swing' | 'intraday' | 'power-hour' | null;

type TraderStateId = 'CALM' | 'LOCKED IN' | 'HESITANT' | 'OVERTRADING' | 'REVENGE RISK' | 'FATIGUED';

const TRADER_STATES: Record<TraderStateId, { color: string; bg: string; border: string; description: string }> = {
  'CALM':          { color: '#00ff88', bg: 'rgba(0,255,136,0.08)', border: 'rgba(0,255,136,0.3)',  description: 'Ideal state. Execute your plan.' },
  'LOCKED IN':     { color: '#00ff88', bg: 'rgba(0,255,136,0.12)', border: 'rgba(0,255,136,0.4)',  description: 'High focus. Follow your rules.' },
  'HESITANT':      { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.35)', description: 'Reduce size. Require confirmation.' },
  'OVERTRADING':   { color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.4)', description: 'Stop. Review your trades.' },
  'REVENGE RISK':  { color: '#ff3b3b', bg: 'rgba(255,59,59,0.12)', border: 'rgba(255,59,59,0.45)', description: 'Step away. Loss streak detected.' },
  'FATIGUED':      { color: '#ff3b3b', bg: 'rgba(255,59,59,0.1)',  border: 'rgba(255,59,59,0.35)', description: 'Close screens. Rest.' },
};

const SCRIPTURE = [
  { verse: 'For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you.', ref: 'Jeremiah 29:11' },
  { verse: 'Be still and know that I am God.', ref: 'Psalm 46:10' },
  { verse: 'Commit to the Lord whatever you do, and he will establish your plans.', ref: 'Proverbs 16:3' },
  { verse: 'I can do all things through Christ who strengthens me.', ref: 'Philippians 4:13' },
  { verse: 'Trust in the Lord with all your heart and lean not on your own understanding.', ref: 'Proverbs 3:5' },
  { verse: 'He who guards his lips guards his life, but he who speaks rashly will come to ruin.', ref: 'Proverbs 13:3' },
  { verse: 'Plans fail for lack of counsel, but with many advisers they succeed.', ref: 'Proverbs 15:22' },
  { verse: 'The plans of the diligent lead to profit as surely as haste leads to poverty.', ref: 'Proverbs 21:5' },
];

const WATCHLIST_SYMBOLS = ['SPY', 'QQQ', 'NQ=F', 'ES=F', 'VIX', 'NVDA', 'TSLA', 'AAPL', 'AMD', 'PLTR'];

// ── Helpers ────────────────────────────────────────────────────────────────────

function pctColor(v: number) {
  if (v > 0) return '#00ff88';
  if (v < 0) return '#ff3b3b';
  return '#6b7280';
}

function Panel({
  title, children, defaultOpen = true,
  storageKey,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
}) {
  const [open, setOpen] = useState(() => {
    if (storageKey && typeof window !== 'undefined') {
      const v = localStorage.getItem(`panel:${storageKey}`);
      return v === null ? defaultOpen : v === 'true';
    }
    return defaultOpen;
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (storageKey && typeof window !== 'undefined') {
      localStorage.setItem(`panel:${storageKey}`, String(next));
    }
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-xs font-bold tracking-widest uppercase" style={{ color: '#6b7280', letterSpacing: '0.1em' }}>
          {title}
        </span>
        {open
          ? <ChevronUp size={13} style={{ color: '#374151' }} />
          : <ChevronDown size={13} style={{ color: '#374151' }} />
        }
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// ── Market Bias Panel ─────────────────────────────────────────────────────────

type FuturesBias = 'bullish' | 'bearish' | 'mixed' | 'neutral';

interface BiasResult {
  bias: 'Bullish' | 'Bearish' | 'Neutral';
  biasScore: number;
  confidence: number;
  color: string;
  bg: string;
  border: string;
  drivers: string[];
  risks: string[];
}

function computeBiasFromSignals(
  esChg: number, nqChg: number, ymChg: number, rtyChg: number,
  vixChg: number, dxyChg: number, tenYChg: number,
  oilChg: number, goldChg: number,
): BiasResult {
  let biasScore = 0;
  const drivers: string[] = [];
  const risks: string[] = [];

  if (esChg > 0)  { biasScore += 1; drivers.push('ES Green'); }
  else if (esChg < 0) { biasScore -= 1; risks.push('ES Red'); }

  if (nqChg > 0)  { biasScore += 1; drivers.push('NQ Green'); }
  else if (nqChg < 0) { biasScore -= 1; risks.push('NQ Red'); }

  if (ymChg > 0)  { biasScore += 1; drivers.push('YM Green'); }
  else if (ymChg < 0) { biasScore -= 1; risks.push('YM Red'); }

  if (rtyChg > 0) { biasScore += 1; drivers.push('RTY Green — Breadth Positive'); }
  else if (rtyChg < 0) { biasScore -= 1; risks.push('RTY Red — Breadth Negative'); }

  if (vixChg < -2)  { drivers.push('VIX Falling'); }
  else if (vixChg > 2) { biasScore -= 1; risks.push('VIX Rising'); }

  if (dxyChg < -0.5)    { drivers.push('DXY Falling'); }
  else if (dxyChg > 0.5) { biasScore -= 1; risks.push('DXY Rising'); }

  if (tenYChg < -0.5)    { drivers.push('10Y Yield Falling'); }
  else if (tenYChg > 0.5) { biasScore -= 1; risks.push('10Y Yield Rising'); }

  if (oilChg < -1.5) { risks.push('Oil Weak'); }
  if (goldChg > 1)   { risks.push('Gold Rising — Flight to Safety'); }

  const totalActive = drivers.length + risks.length;
  const dominantCount = biasScore >= 0 ? drivers.length : risks.length;
  const baseConf = totalActive > 0 ? (dominantCount / totalActive) * 100 : 50;
  const biasBoost = Math.min(20, Math.abs(biasScore) * 4);
  const confidence = Math.min(98, Math.max(30, Math.round(baseConf + biasBoost)));

  if (biasScore >= 3) {
    return { bias: 'Bullish', biasScore, confidence, color: '#00ff88', bg: 'rgba(0,255,136,0.08)', border: 'rgba(0,255,136,0.3)', drivers, risks };
  }
  if (biasScore <= -3) {
    return { bias: 'Bearish', biasScore, confidence, color: '#ff3b3b', bg: 'rgba(255,59,59,0.08)', border: 'rgba(255,59,59,0.3)', drivers, risks };
  }
  return { bias: 'Neutral', biasScore, confidence, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', drivers, risks };
}

function MarketBiasPanel() {
  const [quotes, setQuotes] = useState<Record<string, QuoteData | null>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const syms = ['SPY', 'QQQ', '^VIX', 'ES=F', 'NQ=F', 'YM=F', 'RTY=F', 'DX=F', '^TNX', 'CL=F', 'GC=F'];
    Promise.allSettled(syms.map(s => fetchQuote(s))).then(results => {
      const map: Record<string, QuoteData | null> = {};
      results.forEach((r, i) => { map[syms[i]] = r.status === 'fulfilled' ? r.value : null; });
      setQuotes(map);
      setLoaded(true);
    });
  }, []);

  if (!loaded) {
    return <div className="rounded-xl p-4 animate-pulse" style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.07)', height: 96 }} />;
  }

  const spyChg  = quotes['SPY']?.changePercent ?? 0;
  const qqqChg  = quotes['QQQ']?.changePercent ?? 0;
  const vixChg  = quotes['^VIX']?.changePercent ?? 0;
  const vixPx   = quotes['^VIX']?.price ?? 0;
  const esChg   = quotes['ES=F']?.changePercent ?? 0;
  const nqChg   = quotes['NQ=F']?.changePercent ?? 0;
  const ymChg   = quotes['YM=F']?.changePercent ?? 0;
  const rtyChg  = quotes['RTY=F']?.changePercent ?? 0;
  const dxyChg  = quotes['DX=F']?.changePercent ?? 0;
  const tenYChg = quotes['^TNX']?.changePercent ?? 0;
  const oilChg  = quotes['CL=F']?.changePercent ?? 0;
  const goldChg = quotes['GC=F']?.changePercent ?? 0;

  const result = computeBiasFromSignals(esChg, nqChg, ymChg, rtyChg, vixChg, dxyChg, tenYChg, oilChg, goldChg);
  const { bias: mktBias, confidence, color: mktColor, bg: mktBg, border: mktBorder, drivers, risks } = result;

  const equityBull = spyChg > 0 && qqqChg > 0;
  const equityBear = spyChg < 0 && qqqChg < 0;
  const futuresPos = [esChg > 0, nqChg > 0, ymChg > 0, rtyChg > 0].filter(Boolean).length;
  const futuresBiasLabel: FuturesBias = futuresPos >= 3 ? 'bullish' : futuresPos <= 1 ? 'bearish' : 'neutral';
  const futuresConfirmed = (futuresBiasLabel === 'bullish' && equityBull) || (futuresBiasLabel === 'bearish' && equityBear);
  const confColor = futuresConfirmed ? '#00ff88' : '#f59e0b';

  const warnings: string[] = [];
  if (futuresBiasLabel === 'bearish' && equityBull)
    warnings.push('Futures red but equities green — divergence, elevated risk for longs.');
  if (vixChg > 2 && futuresBiasLabel === 'bearish')
    warnings.push('VIX rising + futures red — bullish trades carry higher risk.');
  if (futuresBiasLabel === 'bullish' && equityBear)
    warnings.push('Futures green but equities weak — wait for equity confirmation.');
  if (dxyChg > 0.7)
    warnings.push(`DXY +${dxyChg.toFixed(1)}% — dollar strength headwind for equities.`);

  const futBiasColor = futuresBiasLabel === 'bullish' ? '#00ff88' : futuresBiasLabel === 'bearish' ? '#ff3b3b' : '#f59e0b';

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#111318', border: `1px solid ${mktBorder}` }}>
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#374151' }}>Market Bias</span>
        <span className="text-sm font-black px-2 py-0.5 rounded" style={{ color: mktColor, background: mktBg, border: `1px solid ${mktBorder}` }}>
          {mktBias.toUpperCase()}
        </span>
        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded" style={{ color: mktColor, background: `${mktColor}14`, border: `1px solid ${mktColor}30` }}>
          {confidence}% Confidence
        </span>
        <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ color: confColor, background: `${confColor}14`, border: `1px solid ${confColor}40` }}>
          Futures {futuresConfirmed ? 'CONFIRMED ✓' : 'NOT CONFIRMED ⚠'}
        </span>
        <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ color: futBiasColor, background: `${futBiasColor}10`, border: `1px solid ${futBiasColor}30` }}>
          Futures {futuresBiasLabel.toUpperCase()}
        </span>
        {vixPx > 0 && (
          <span className="text-xs font-mono font-bold ml-auto" style={{ color: vixPx > 25 ? '#ff3b3b' : vixPx > 18 ? '#f59e0b' : '#9ca3af' }}>
            VIX {vixPx.toFixed(1)} {vixChg > 2 ? '▲' : vixChg < -2 ? '▼' : ''}
          </span>
        )}
      </div>

      {/* Futures strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        {[
          { label: 'ES (S&P)', q: quotes['ES=F']  },
          { label: 'NQ (NAS)', q: quotes['NQ=F']  },
          { label: 'YM (DOW)', q: quotes['YM=F']  },
          { label: 'RTY (RUT)', q: quotes['RTY=F'] },
        ].map(({ label, q }) => {
          const chg = q?.changePercent ?? 0;
          const c = chg > 0.1 ? '#00ff88' : chg < -0.1 ? '#ff3b3b' : '#6b7280';
          return (
            <div key={label} className="flex flex-col items-center py-2 px-3" style={{ background: '#0d0f14' }}>
              <span className="text-xs" style={{ color: '#374151', fontSize: 9 }}>{label}</span>
              {q ? (
                <>
                  <span className="text-sm font-mono font-bold" style={{ color: '#f0f0f0' }}>
                    {q.price >= 1000 ? q.price.toLocaleString('en-US', { maximumFractionDigits: 0 }) : q.price.toFixed(2)}
                  </span>
                  <span className="text-xs font-mono font-semibold" style={{ color: c }}>
                    {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                  </span>
                </>
              ) : (
                <span className="text-xs" style={{ color: '#374151' }}>—</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Macro strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px" style={{ borderBottom: (drivers.length > 0 || risks.length > 0 || warnings.length > 0) ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
        {[
          { label: 'DXY', q: quotes['DX=F'], invertColor: true },
          { label: '10Y Yield', q: quotes['^TNX'], invertColor: true },
          { label: 'Oil', q: quotes['CL=F'], invertColor: false },
          { label: 'Gold', q: quotes['GC=F'], invertColor: false },
        ].map(({ label, q, invertColor }) => {
          const chg = q?.changePercent ?? 0;
          // For DXY and 10Y, rising is a risk (bearish for equities)
          const c = invertColor
            ? (chg > 0.3 ? '#f59e0b' : chg < -0.3 ? '#00ff88' : '#6b7280')
            : (chg > 0.1 ? '#00ff88' : chg < -0.1 ? '#ff3b3b' : '#6b7280');
          return (
            <div key={label} className="flex flex-col items-center py-2 px-3" style={{ background: '#0a0c10' }}>
              <span className="text-xs" style={{ color: '#374151', fontSize: 9 }}>{label}</span>
              {q ? (
                <>
                  <span className="text-xs font-mono font-bold" style={{ color: '#f0f0f0' }}>
                    {q.price.toFixed(label === '10Y Yield' ? 3 : 2)}
                  </span>
                  <span className="text-xs font-mono font-semibold" style={{ color: c }}>
                    {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                  </span>
                </>
              ) : (
                <span className="text-xs" style={{ color: '#374151' }}>—</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Drivers & Risks */}
      {(drivers.length > 0 || risks.length > 0) && (
        <div className="px-4 py-2 grid grid-cols-2 gap-2" style={{ borderBottom: warnings.length > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
          <div>
            {drivers.map((d, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs py-0.5" style={{ color: '#00ff88' }}>
                <span style={{ fontWeight: 700 }}>✓</span> {d}
              </div>
            ))}
          </div>
          <div>
            {risks.map((r, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs py-0.5" style={{ color: '#f59e0b' }}>
                <span>⚠</span> {r}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2 px-4 py-2 text-xs"
          style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.04)', color: '#f59e0b' }}>
          <span style={{ flexShrink: 0 }}>⚠</span> {w}
        </div>
      ))}
    </div>
  );
}

// ── Quote Row ─────────────────────────────────────────────────────────────────

function QuoteRow({ symbol }: { symbol: string }) {
  const [q, setQ] = useState<QuoteData | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetchQuote(symbol).then(setQ).catch(() => setErr(true));
  }, [symbol]);

  if (err) return null;

  return (
    <div
      className="flex items-center justify-between py-2"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
    >
      <span className="text-xs font-semibold" style={{ color: '#9ca3af' }}>{symbol}</span>
      {q ? (
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono font-bold" style={{ color: '#f0f0f0' }}>
            ${q.price.toFixed(2)}
          </span>
          <span
            className="text-xs font-mono font-semibold"
            style={{ color: pctColor(q.changePercent) }}
          >
            {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
          </span>
        </div>
      ) : (
        <div className="h-4 w-24 rounded animate-pulse" style={{ background: '#1a1d26' }} />
      )}
    </div>
  );
}

// ── Trader State Widget ───────────────────────────────────────────────────────

function TraderStateWidget() {
  const [current, setCurrent] = useState<TraderStateId>('CALM');
  const st = TRADER_STATES[current];
  const keys = Object.keys(TRADER_STATES) as TraderStateId[];

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: st.bg,
        border: `1px solid ${st.border}`,
      }}
    >
      <p className="sec-label mb-3">Trader State</p>
      <div
        className="text-center py-3 mb-3 rounded-lg"
        style={{ background: 'rgba(0,0,0,0.3)' }}
      >
        <p
          className="text-xl font-black tracking-widest"
          style={{ color: st.color, letterSpacing: '0.1em' }}
        >
          {current}
        </p>
        <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
          {st.description}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {keys.map(k => {
          const s = TRADER_STATES[k];
          const active = k === current;
          return (
            <button
              key={k}
              onClick={() => setCurrent(k)}
              className="text-xs font-bold py-1.5 rounded-lg transition-all"
              style={{
                background: active ? s.bg : 'rgba(0,0,0,0.25)',
                border: `1px solid ${active ? s.border : 'rgba(255,255,255,0.06)'}`,
                color: active ? s.color : '#6b7280',
                fontSize: '9px',
                letterSpacing: '0.04em',
              }}
            >
              {k}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Scripture Widget ──────────────────────────────────────────────────────────

function ScriptureWidget() {
  const [open, setOpen] = useState(false);
  const [idx]  = useState(() => Math.floor(Math.random() * SCRIPTURE.length));
  const s = SCRIPTURE[idx];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:scale-105"
        style={{
          background: '#111318',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#6b7280',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}
      >
        <span style={{ fontSize: '14px' }}>✦</span>
        Word
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-5 right-5 z-50 rounded-xl p-4 max-w-xs animate-fade-in"
      style={{
        background: '#111318',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <span style={{ fontSize: '16px' }}>✦</span>
        <button onClick={() => setOpen(false)} style={{ color: '#374151', fontSize: '18px', lineHeight: 1 }}>×</button>
      </div>
      <p className="text-sm leading-relaxed mb-2" style={{ color: '#d1d5db', fontStyle: 'italic' }}>
        "{s.verse}"
      </p>
      <p className="text-xs font-semibold" style={{ color: '#6b7280' }}>{s.ref}</p>
    </div>
  );
}

// ── Mode Destination Map ───────────────────────────────────────────────────────

const MODE_ROUTES: Record<NonNullable<ActiveMode>, string> = {
  'swing':      '/swing-engine',
  'intraday':   '/intraday-scanner',
  'power-hour': '/power-hour',
};

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [activeMode, setActiveMode] = useState<ActiveMode>(null);
  const [news, setNews]     = useState<any[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [spyQuote, setSpyQuote] = useState<QuoteData | null>(null);
  const [scriptureIdx] = useState(() => Math.floor(Math.random() * SCRIPTURE.length));

  const loadNews = useCallback(async () => {
    setNewsLoading(true);
    try {
      const data = await fetchNews('SPY');
      setNews(data.news ?? []);
    } catch { /* silent */ }
    setNewsLoading(false);
  }, []);

  useEffect(() => {
    loadNews();
    fetchQuote('SPY').then(setSpyQuote).catch(() => null);
  }, [loadNews]);

  const handleModeEnter = (mode: ActiveMode) => {
    if (!mode) return;
    setActiveMode(mode);
    setTimeout(() => router.push(MODE_ROUTES[mode]), 300);
  };

  return (
    <AppShell title="Dashboard">
      {/* ── Mode Selector ─────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-10 flex flex-wrap items-center gap-3 mb-6 py-3 -mx-4 px-4 lg:-mx-5 lg:px-5"
        style={{
          background: 'rgba(13,15,20,0.92)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <span className="text-xs font-bold tracking-widest uppercase mr-2" style={{ color: '#374151' }}>
          Enter Mode:
        </span>
        {(
          [
            { mode: 'swing',      label: 'Swing Trades',   question: 'Higher-timeframe setups' },
            { mode: 'intraday',   label: 'Intraday',        question: 'Momentum & flow'         },
            { mode: 'power-hour', label: 'Power Hour',      question: '3–4 PM execution'        },
          ] as { mode: NonNullable<ActiveMode>; label: string; question: string }[]
        ).map(({ mode, label, question }) => (
          <button
            key={mode}
            onClick={() => handleModeEnter(mode)}
            className={`mode-btn flex flex-col items-start ${activeMode === mode ? 'active' : ''}`}
          >
            <span>{label}</span>
            <span style={{ fontSize: '10px', opacity: 0.6, fontWeight: 400 }}>{question}</span>
          </button>
        ))}

        {spyQuote && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-mono" style={{ color: '#9ca3af' }}>SPY</span>
            <span className="text-sm font-mono font-bold" style={{ color: '#f0f0f0' }}>
              ${spyQuote.price.toFixed(2)}
            </span>
            <span
              className="text-xs font-mono font-semibold flex items-center gap-0.5"
              style={{ color: pctColor(spyQuote.changePercent) }}
            >
              {spyQuote.changePercent >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {spyQuote.changePercent >= 0 ? '+' : ''}{spyQuote.changePercent.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {/* ── Main question ──────────────────────────────────────────────────── */}
      <div className="mb-6 text-center">
        <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: '#374151' }}>
          Today's Core Question
        </p>
        <p className="text-lg font-semibold" style={{ color: '#9ca3af' }}>
          What mode should I enter?
        </p>
      </div>

      {/* ── Primary grid ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-5" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        {/* Trader State */}
        <div className="xl:col-span-1">
          <TraderStateWidget />
        </div>

        {/* Market Bias + Futures Confirmation */}
        <div className="xl:col-span-2">
          <p className="sec-label mb-2" style={{ paddingLeft: 4 }}>Market Bias &amp; Futures</p>
          <MarketBiasPanel />
          <div className="mt-2">
            <Link
              href="/mnq-dashboard"
              className="block text-center text-xs font-bold py-2 rounded-lg transition-all hover:scale-[1.02]"
              style={{
                color: '#00ff88',
                background: 'rgba(0,255,136,0.07)',
                border: '1px solid rgba(0,255,136,0.2)',
              }}
            >
              Open Futures Decision Engine →
            </Link>
          </div>
        </div>

        {/* Watchlist */}
        <div
          className="xl:col-span-1 rounded-xl p-4"
          style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <p className="sec-label">Watchlist</p>
          <div>
            {['NVDA', 'TSLA', 'AAPL', 'AMD', 'PLTR', 'META'].map(sym => (
              <QuoteRow key={sym} symbol={sym} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Secondary panels ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        {/* News */}
        <div className="lg:col-span-2">
          <Panel title="Market News" storageKey="dash-news">
            {newsLoading ? (
              <div className="space-y-2 pt-1">
                {[1,2,3].map(i => (
                  <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: '#13161d' }} />
                ))}
              </div>
            ) : news.length === 0 ? (
              <p className="text-xs py-4 text-center" style={{ color: '#374151' }}>
                Configure FINNHUB_API_KEY for news.
              </p>
            ) : (
              <div className="space-y-0">
                {news.slice(0, 6).map((item, i) => (
                  <a
                    key={i}
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col gap-0.5 py-2.5 hover:bg-white/[0.02] rounded transition-colors -mx-1 px-1"
                    style={{ borderBottom: i < 5 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                  >
                    <p className="text-sm font-medium leading-snug line-clamp-2" style={{ color: '#d1d5db' }}>
                      {item.title}
                    </p>
                    <p className="text-xs" style={{ color: '#374151' }}>
                      {item.publisher} · {new Date(item.publishedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </a>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* Quick Nav + Rules */}
        <div className="space-y-4">
          <Panel title="Jump To" storageKey="dash-jumpto">
            <div className="space-y-2 pt-1">
              {[
                { href: '/mnq-dashboard',    label: 'Futures Decision Engine', color: '#00ff88' },
                { href: '/swing-engine',     label: 'Swing Trades',            color: '#00ff88' },
                { href: '/intraday-scanner', label: 'Intraday Scanner',         color: '#f59e0b' },
                { href: '/power-hour',       label: 'Power Hour',              color: '#f97316' },
              ].map(({ href, label, color }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold transition-all hover:scale-[1.01]"
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    color,
                  }}
                >
                  <span>{label}</span>
                  <span style={{ color: '#374151', fontSize: '12px' }}>→</span>
                </Link>
              ))}
            </div>
          </Panel>

          <Panel title="Daily Rules" storageKey="dash-rules">
            <div className="space-y-1.5 pt-1">
              {[
                'Max 3 trades per session',
                'No trading 12–2 PM ET',
                'Stop after 2 consecutive losses',
                'Never risk > 1% per trade',
                'Journal every trade',
              ].map((rule, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-xs"
                  style={{ color: '#9ca3af' }}
                >
                  <span style={{ color: '#00ff88', fontWeight: 700, marginTop: '1px' }}>—</span>
                  {rule}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      {/* ── Economic calendar ─────────────────────────────────────────────── */}
      <Panel title="Key Economic Events This Week" storageKey="dash-econ" defaultOpen={false}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          {[
            { name: 'FOMC Minutes',    risk: 'HIGH',   time: 'Wed 2:00 PM ET',  note: 'Expect volatility' },
            { name: 'Jobless Claims',  risk: 'MEDIUM', time: 'Thu 8:30 AM ET',  note: 'Weekly release' },
            { name: 'NFP / CPI',       risk: 'HIGH',   time: 'Fri 8:30 AM ET',  note: 'Check calendar' },
            { name: 'ISM Services',    risk: 'MEDIUM', time: 'Fri 10:00 AM ET', note: 'Monthly' },
            { name: 'PCE Inflation',   risk: 'HIGH',   time: 'Last Fri of month', note: 'Major macro move' },
            { name: 'Fed Speaker',     risk: 'MEDIUM', time: 'Variable',         note: 'Check FOMC cal' },
          ].map((ev, i) => (
            <div
              key={i}
              className="rounded-lg p-3"
              style={{
                background: '#13161d',
                border: `1px solid ${ev.risk === 'HIGH' ? 'rgba(255,59,59,0.25)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold" style={{ color: '#f0f0f0' }}>{ev.name}</span>
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded"
                  style={{
                    color: ev.risk === 'HIGH' ? '#ff3b3b' : '#f59e0b',
                    background: ev.risk === 'HIGH' ? 'rgba(255,59,59,0.1)' : 'rgba(245,158,11,0.1)',
                  }}
                >
                  {ev.risk}
                </span>
              </div>
              <p className="text-xs font-mono" style={{ color: '#6b7280' }}>{ev.time}</p>
              <p className="text-xs mt-0.5" style={{ color: '#374151' }}>{ev.note}</p>
            </div>
          ))}
        </div>
      </Panel>

      {/* ── Scripture widget (floating) ────────────────────────────────────── */}
      <ScriptureWidget />
    </AppShell>
  );
}

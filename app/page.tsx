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
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        {/* Trader State */}
        <div className="xl:col-span-1">
          <TraderStateWidget />
        </div>

        {/* Market Quick Stats */}
        <div
          className="xl:col-span-1 rounded-xl p-4 space-y-3"
          style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <p className="sec-label">Market Pulse</p>
          {['SPY', 'QQQ', 'VIX'].map(sym => (
            <QuoteRow key={sym} symbol={sym} />
          ))}
        </div>

        {/* Futures Strip */}
        <div
          className="xl:col-span-1 rounded-xl p-4"
          style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <p className="sec-label">Futures</p>
          <div className="space-y-1">
            {['NQ=F', 'ES=F', 'YM=F', 'RTY=F'].map(sym => (
              <QuoteRow key={sym} symbol={sym} />
            ))}
          </div>
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
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

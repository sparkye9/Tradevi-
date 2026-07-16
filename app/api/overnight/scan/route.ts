// app/api/overnight/scan/route.ts — 24H / Overnight & Pre-Market opportunity scanner
// Two engines:
//   1. Index futures (ES/NQ/YM/RTY/DAX/NKD/GC/CL) — trade nearly 24h on Globex,
//      so their live change reflects the overnight session bias.
//   2. Extended-hours stock movers — biggest pre-market / after-hours gappers
//      you can trade in the 4:00am–9:30am pre-market or 4:00–8:00pm post sessions.
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { fetchYahooQuotes } from '@/lib/yahoo-screener';

// ─── Universe ────────────────────────────────────────────────────────────────

const FUTURES = [
  { yahoo: 'ES=F',   symbol: 'ES',   name: 'S&P 500' },
  { yahoo: 'NQ=F',   symbol: 'NQ',   name: 'Nasdaq 100' },
  { yahoo: 'YM=F',   symbol: 'YM',   name: 'Dow Jones' },
  { yahoo: 'RTY=F',  symbol: 'RTY',  name: 'Russell 2000' },
  { yahoo: '^GDAXI', symbol: 'DAX',  name: 'DAX 40' },
  { yahoo: 'NKD=F',  symbol: 'NKD',  name: 'Nikkei 225' },
  { yahoo: 'GC=F',   symbol: 'GC',   name: 'Gold' },
  { yahoo: 'CL=F',   symbol: 'CL',   name: 'Crude Oil' },
];

// Liquid names that actually trade in extended hours with real volume
const MOVERS_UNIVERSE = [
  'NVDA','TSLA','AMD','META','AAPL','MSFT','AMZN','GOOGL','NFLX','AVGO',
  'PLTR','COIN','MSTR','MARA','RIOT','SMCI','ARM','SOFI','RIVN','LCID',
  'BABA','NIO','INTC','MU','QCOM','CRM','ORCL','ADBE','SHOP','UBER',
  'DIS','BA','JPM','GS','XOM','CVX','WMT','COST','PDD','ASML',
  'SPY','QQQ','IWM','DIA','SMH','ARKK','XLE','XLF','GLD','TLT',
];

// ─── Session detection ───────────────────────────────────────────────────────

type Session = 'pre-market' | 'regular' | 'after-hours' | 'overnight' | 'closed';

function detectSession(marketState: string | undefined): Session {
  switch (marketState) {
    case 'PRE': return 'pre-market';
    case 'REGULAR': return 'regular';
    case 'POST': return 'after-hours';
    case 'POSTPOST':
    case 'PREPRE': return 'overnight';
    case 'CLOSED': return 'overnight';
    default: return 'closed';
  }
}

// ─── ICT-style overnight scoring (bearish-first, direction-aware) ────────────

interface Scored {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;   // session-relevant change
  direction: 'PUT' | 'CALL' | 'NONE';
  score: number;
  grade: string;
  reasons: string[];
}

function gradeFromScore(s: number): string {
  if (s >= 85) return 'A+';
  if (s >= 70) return 'A';
  if (s >= 55) return 'B';
  return 'WATCH';
}

function scoreMove(chg: number | null): { direction: 'PUT' | 'CALL' | 'NONE'; score: number; reasons: string[] } {
  if (chg === null) return { direction: 'NONE', score: 0, reasons: [] };
  const mag = Math.abs(chg);
  const bearish = chg < 0;
  const reasons: string[] = [];

  let score = 0;
  // Displacement — the size of the overnight move is the core signal
  if (mag >= 2.0) { score += 45; reasons.push('Large displacement move (>2%)'); }
  else if (mag >= 1.0) { score += 32; reasons.push('Strong displacement (>1%)'); }
  else if (mag >= 0.5) { score += 20; reasons.push('Clean directional move (>0.5%)'); }
  else if (mag >= 0.25) { score += 10; reasons.push('Early directional lean'); }
  else return { direction: 'NONE', score: Math.round(mag * 20), reasons: ['Range-bound overnight'] };

  // Directional structure context
  if (bearish) {
    score += 20; reasons.push('Bearish overnight structure');
    if (mag >= 1.5) { score += 15; reasons.push('Sustained sell pressure — likely BOS');}
  } else {
    score += 20; reasons.push('Bullish overnight structure');
    if (mag >= 1.5) { score += 15; reasons.push('Sustained buy pressure — likely BOS'); }
  }

  return {
    direction: bearish ? 'PUT' : 'CALL',
    score: Math.min(100, score),
    reasons,
  };
}

// ─── Cache ───────────────────────────────────────────────────────────────────

let cache: { data: unknown; ts: number } | null = null;
const TTL = 60_000;

export async function GET() {
  const now = new Date().toISOString();
  if (cache && Date.now() - cache.ts < TTL) {
    return NextResponse.json(cache.data);
  }

  try {
    const [futuresQuotes, moverQuotes] = await Promise.all([
      fetchYahooQuotes(FUTURES.map((f) => f.yahoo)).catch(() => []),
      fetchYahooQuotes(MOVERS_UNIVERSE).catch(() => []),
    ]);

    // ── Futures overnight bias ──
    const futuresMap = new Map(futuresQuotes.map((q) => [q.symbol.toUpperCase(), q]));
    const futures: Scored[] = FUTURES.map((f) => {
      const q = futuresMap.get(f.yahoo.toUpperCase());
      const chg = q?.regularMarketChangePercent ?? null;
      const { direction, score, reasons } = scoreMove(chg);
      return {
        symbol: f.symbol,
        name: f.name,
        price: q?.regularMarketPrice ?? null,
        changePercent: chg,
        direction,
        score,
        grade: gradeFromScore(score),
        reasons,
      };
    }).sort((a, b) => b.score - a.score);

    // ── Session state (from a broad index quote) ──
    const spy = moverQuotes.find((q) => q.symbol.toUpperCase() === 'SPY');
    const session = detectSession(spy?.marketState);

    // ── Extended-hours movers ──
    const movers = moverQuotes
      .map((q) => {
        const state = q.marketState;
        // Choose the session-relevant change: pre-market, after-hours, else regular
        let chg: number | null = null;
        let extPrice: number | null = null;
        if ((state === 'PRE' || state === 'PREPRE') && q.preMarketChangePercent != null) {
          chg = q.preMarketChangePercent;
          extPrice = q.preMarketPrice ?? null;
        } else if ((state === 'POST' || state === 'POSTPOST') && q.postMarketChangePercent != null) {
          chg = q.postMarketChangePercent;
          extPrice = q.postMarketPrice ?? null;
        } else {
          chg = q.regularMarketChangePercent ?? null;
          extPrice = q.regularMarketPrice ?? null;
        }
        const { direction, score, reasons } = scoreMove(chg);
        return {
          symbol: q.symbol,
          name: q.shortName ?? q.symbol,
          price: extPrice,
          regularPrice: q.regularMarketPrice ?? null,
          changePercent: chg,
          direction,
          score,
          grade: gradeFromScore(score),
          reasons,
          sector: q.sector ?? null,
        };
      })
      .filter((m) => m.changePercent !== null && Math.abs(m.changePercent) >= 0.5)
      .sort((a, b) => b.score - a.score);

    // Cross-market confirmation: are the majors aligned bearish or bullish?
    const majorFutures = futures.filter((f) => ['ES', 'NQ', 'YM', 'RTY'].includes(f.symbol));
    const bearMajors = majorFutures.filter((f) => f.direction === 'PUT' && f.score >= 55).length;
    const bullMajors = majorFutures.filter((f) => f.direction === 'CALL' && f.score >= 55).length;
    let confirmation: { bias: 'BEARISH' | 'BULLISH' | 'MIXED'; note: string };
    if (bearMajors >= 3) {
      confirmation = { bias: 'BEARISH', note: `${bearMajors}/4 major indices weak overnight — short bias confirmed` };
    } else if (bullMajors >= 3) {
      confirmation = { bias: 'BULLISH', note: `${bullMajors}/4 major indices strong overnight — long bias confirmed` };
    } else {
      confirmation = { bias: 'MIXED', note: 'Indices not aligned — wait for a clean sweep before committing' };
    }

    const payload = {
      session,
      confirmation,
      futures,
      movers: movers.slice(0, 12),
      source: 'Yahoo Finance (Globex + extended hours)',
      lastUpdated: now,
    };
    cache = { data: payload, ts: Date.now() };
    return NextResponse.json(payload);
  } catch (err) {
    if (cache) {
      return NextResponse.json({ ...(cache.data as object), sourceError: 'Live fetch failed — serving cached data' });
    }
    return NextResponse.json({
      session: 'closed',
      confirmation: { bias: 'MIXED', note: 'Data unavailable' },
      futures: [],
      movers: [],
      source: 'Yahoo Finance',
      sourceError: String(err),
      lastUpdated: now,
    }, { status: 200 });
  }
}

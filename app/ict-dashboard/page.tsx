'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, Clock,
  Target, AlertTriangle, ChevronUp, ChevronDown, Activity,
} from 'lucide-react';
import { createChart, CrosshairMode, LineStyle, CandlestickSeries, createSeriesMarkers } from 'lightweight-charts';
import type { PriceLineOptions } from 'lightweight-charts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SessionRange {
  high: number;
  low: number;
  mid: number;
  startTime: number;
  endTime: number;
}

interface SweepEvent {
  time: number;
  type: 'bullish' | 'bearish';
  level: number;
  levelName: string;
  candleHigh: number;
  candleLow: number;
}

interface ICTLevels {
  asia: SessionRange | null;
  london: SessionRange | null;
  monday: SessionRange | null;
  prevDay: { high: number; low: number; mid: number } | null;
  premarket: { high: number; low: number; mid: number } | null;
  vwap: number | null;
  orb: { high: number; low: number; mid: number } | null;
}

// ─── Session time helpers (New York / ET) ─────────────────────────────────────

function getETOffsetHours(): number {
  // EDT = UTC-4 (Mar–Nov approx), EST = UTC-5
  const m = new Date().getMonth() + 1; // 1-12
  if (m >= 4 && m <= 10) return -4;
  if (m === 3) return new Date().getDate() >= 8 ? -4 : -5;
  if (m === 11) return new Date().getDate() <= 7 ? -4 : -5;
  return -5;
}

/** Return today's date string in YYYY-MM-DD in ET timezone */
function todayET(): string {
  const offset = getETOffsetHours();
  const d = new Date(Date.now() + offset * 3600000);
  return d.toISOString().split('T')[0];
}

/** UTC timestamp for a given YYYY-MM-DD date at hh:mm ET */
function etToUtc(dateStr: string, etHour: number, etMin = 0): number {
  const offset = getETOffsetHours();
  return Math.floor(new Date(`${dateStr}T${String(etHour).padStart(2, '0')}:${String(etMin).padStart(2, '0')}:00Z`).getTime() / 1000) - offset * 3600;
}

/** Previous calendar date string */
function prevDateStr(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
}

function prevWeekday(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  do { d.setUTCDate(d.getUTCDate() - 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().split('T')[0];
}

function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split('T')[0];
}

// ─── Calculations ─────────────────────────────────────────────────────────────

function calcSessionRange(candles: Candle[], startTs: number, endTs: number): SessionRange | null {
  const slice = candles.filter(c => c.time >= startTs && c.time < endTs);
  if (!slice.length) return null;
  const high = Math.max(...slice.map(c => c.high));
  const low  = Math.min(...slice.map(c => c.low));
  return { high, low, mid: (high + low) / 2, startTime: startTs, endTime: endTs };
}

function calcVWAP(candles: Candle[], startTs: number): number | null {
  const slice = candles.filter(c => c.time >= startTs);
  if (!slice.length) return null;
  let cumTP = 0, cumVol = 0;
  for (const c of slice) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTP  += tp * c.volume;
    cumVol += c.volume;
  }
  return cumVol > 0 ? cumTP / cumVol : null;
}

function detectSweeps(candles: Candle[], levels: ICTLevels): SweepEvent[] {
  const sweeps: SweepEvent[] = [];
  if (!candles.length) return sweeps;

  const namedLevels: { price: number; name: string }[] = [];
  if (levels.asia)     { namedLevels.push({ price: levels.asia.high, name: 'Asia High' }); namedLevels.push({ price: levels.asia.low, name: 'Asia Low' }); }
  if (levels.london)   { namedLevels.push({ price: levels.london.high, name: 'London High' }); namedLevels.push({ price: levels.london.low, name: 'London Low' }); }
  if (levels.prevDay)  { namedLevels.push({ price: levels.prevDay.high, name: 'Prev Day High' }); namedLevels.push({ price: levels.prevDay.low, name: 'Prev Day Low' }); }
  if (levels.premarket){ namedLevels.push({ price: levels.premarket.high, name: 'Premarket High' }); namedLevels.push({ price: levels.premarket.low, name: 'Premarket Low' }); }
  if (levels.monday)   { namedLevels.push({ price: levels.monday.high, name: 'Monday High' }); namedLevels.push({ price: levels.monday.low, name: 'Monday Low' }); }

  for (const c of candles) {
    for (const { price, name } of namedLevels) {
      // Bearish sweep: wick above level, closes back below
      if (c.high > price && c.close < price) {
        sweeps.push({ time: c.time, type: 'bearish', level: price, levelName: name, candleHigh: c.high, candleLow: c.low });
      }
      // Bullish sweep: wick below level, closes back above
      if (c.low < price && c.close > price) {
        sweeps.push({ time: c.time, type: 'bullish', level: price, levelName: name, candleHigh: c.high, candleLow: c.low });
      }
    }
  }

  // Deduplicate: one sweep per level per 15-min window
  const seen = new Set<string>();
  return sweeps.filter(s => {
    const key = `${s.levelName}-${Math.floor(s.time / 900)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => b.time - a.time).slice(0, 12);
}

function calcBias(candles: Candle[], levels: ICTLevels, sweeps: SweepEvent[], price: number): { bias: 'bullish' | 'bearish' | 'neutral'; score: number; factors: string[] } {
  let score = 0;
  const factors: string[] = [];

  // VWAP
  if (levels.vwap) {
    if (price > levels.vwap) { score += 2; factors.push('Price above VWAP'); }
    else { score -= 2; factors.push('Price below VWAP'); }
  }

  // ORB
  if (levels.orb) {
    if (price > levels.orb.high) { score += 2; factors.push('Above ORB high'); }
    else if (price < levels.orb.low) { score -= 2; factors.push('Below ORB low'); }
  }

  // Session position
  if (levels.london) {
    if (price > levels.london.mid) { score += 1; factors.push('Above London mid'); }
    else { score -= 1; factors.push('Below London mid'); }
  }
  if (levels.asia) {
    if (price > levels.asia.mid) { score += 1; factors.push('Above Asia mid'); }
    else { score -= 1; factors.push('Below Asia mid'); }
  }

  // Recent sweeps (last 3)
  const recent = sweeps.slice(0, 3);
  for (const s of recent) {
    if (s.type === 'bullish') { score += 2; factors.push(`Bullish sweep: ${s.levelName}`); }
    else { score -= 2; factors.push(`Bearish sweep: ${s.levelName}`); }
  }

  // Momentum: last 5 candles
  const tail = candles.slice(-5);
  if (tail.length >= 5) {
    const bulls = tail.filter(c => c.close > c.open).length;
    if (bulls >= 4) { score += 1; factors.push('Bullish momentum (4/5 candles)'); }
    else if (bulls <= 1) { score -= 1; factors.push('Bearish momentum'); }
  }

  // Volume: last candle vs 20-bar avg
  if (candles.length >= 20) {
    const avgVol = candles.slice(-20, -1).reduce((s, c) => s + c.volume, 0) / 19;
    const lastVol = candles.at(-1)!.volume;
    const lastClose = candles.at(-1)!;
    if (lastVol > avgVol * 1.5) {
      if (lastClose.close > lastClose.open) { score += 1; factors.push('High-volume bullish candle'); }
      else { score -= 1; factors.push('High-volume bearish candle'); }
    }
  }

  const bias: 'bullish' | 'bearish' | 'neutral' = score > 1 ? 'bullish' : score < -1 ? 'bearish' : 'neutral';
  return { bias, score, factors };
}

function calcProbabilityScore(bias: ReturnType<typeof calcBias>, sweeps: SweepEvent[], levels: ICTLevels, price: number): number {
  let pts = 0;

  // Trend alignment (0–3)
  pts += Math.min(3, Math.abs(bias.score) * 0.4);

  // Sweep confluence (0–2)
  const recentSweeps = sweeps.slice(0, 3);
  const alignedSweeps = recentSweeps.filter(s =>
    (bias.bias === 'bullish' && s.type === 'bullish') ||
    (bias.bias === 'bearish' && s.type === 'bearish')
  );
  pts += Math.min(2, alignedSweeps.length);

  // Session positioning (0–2)
  let sessionPts = 0;
  if (levels.vwap && ((bias.bias === 'bullish' && price > levels.vwap) || (bias.bias === 'bearish' && price < levels.vwap))) sessionPts++;
  if (levels.orb && ((bias.bias === 'bullish' && price > levels.orb.high) || (bias.bias === 'bearish' && price < levels.orb.low))) sessionPts++;
  pts += Math.min(2, sessionPts);

  // ORB confirmation (0–2)
  if (levels.orb) {
    const orbBias = price > levels.orb.high ? 'bullish' : price < levels.orb.low ? 'bearish' : 'neutral';
    if (orbBias === bias.bias) pts += 2;
  }

  // VWAP alignment (0–1)
  if (levels.vwap && ((bias.bias === 'bullish' && price > levels.vwap) || (bias.bias === 'bearish' && price < levels.vwap))) pts += 1;

  return Math.min(10, Math.max(1, Math.round(pts)));
}

function calcTradeZones(price: number, bias: ReturnType<typeof calcBias>, levels: ICTLevels) {
  const isBull = bias.bias === 'bullish';
  const atr = 0.003 * price; // ~0.3% ATR estimate

  let entry = price;
  let stop  = isBull ? price - atr * 2 : price + atr * 2;

  // Refine entry using session levels
  if (isBull) {
    if (levels.vwap && levels.vwap < price && levels.vwap > price - atr * 3) entry = Math.max(entry, levels.vwap);
    if (levels.orb && levels.orb.high < price) entry = Math.max(entry, levels.orb.high);
    stop = Math.min(stop, entry - atr * 1.5);
  } else if (bias.bias === 'bearish') {
    if (levels.vwap && levels.vwap > price && levels.vwap < price + atr * 3) entry = Math.min(entry, levels.vwap);
    if (levels.orb && levels.orb.low > price) entry = Math.min(entry, levels.orb.low);
    stop = Math.max(stop, entry + atr * 1.5);
  }

  const riskPts  = Math.abs(entry - stop);
  const t1 = isBull ? entry + riskPts * 1.5 : entry - riskPts * 1.5;
  const t2 = isBull ? entry + riskPts * 2.5 : entry - riskPts * 2.5;
  const t3 = isBull ? entry + riskPts * 4.0 : entry - riskPts * 4.0;

  return { entry, stop, t1, t2, t3, rr1: 1.5, rr2: 2.5, rr3: 4.0, riskPts };
}

// ─── Session timers ───────────────────────────────────────────────────────────

function getSessionCountdowns(): { label: string; color: string; secsUntil: number; isActive: boolean }[] {
  const nowEtMs = Date.now() + getETOffsetHours() * 3600000;
  const etH = new Date(nowEtMs).getUTCHours();
  const etM = new Date(nowEtMs).getUTCMinutes();
  const etS = new Date(nowEtMs).getUTCSeconds();
  const etTotalSec = etH * 3600 + etM * 60 + etS;

  function secUntil(targetH: number, targetM = 0): number {
    const target = targetH * 3600 + targetM * 60;
    const diff = target - etTotalSec;
    return diff >= 0 ? diff : diff + 86400;
  }

  return [
    { label: 'Asia Open',   color: '#7c3aed', secsUntil: secUntil(20),     isActive: etH >= 20 || etH < 0 },
    { label: 'London Open', color: '#2563eb', secsUntil: secUntil(3),      isActive: etH >= 3 && etH < 8 },
    { label: 'NY Open',     color: '#059669', secsUntil: secUntil(9, 30),  isActive: etH >= 9 && (etH < 16 || (etH === 9 && etM >= 30)) },
    { label: 'Power Hour',  color: '#d97706', secsUntil: secUntil(15),     isActive: etH >= 15 && etH < 16 },
  ];
}

function fmtCountdown(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0
    ? `${h}h ${String(m).padStart(2, '0')}m`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Chart renderer ───────────────────────────────────────────────────────────

const SESSION_COLORS = { asia: '#7c3aed', london: '#2563eb', monday: '#d97706', prevDay: '#6b7280', premarket: '#0891b2', vwap: '#f97316', orb: '#16a34a' };

function addLevel(series: any, price: number, color: string, title: string, dashed = true) {
  series.createPriceLine({
    price,
    color,
    lineWidth: dashed ? 1 : 2,
    lineStyle: dashed ? LineStyle.Dashed : LineStyle.Solid,
    axisLabelVisible: true,
    title,
  } as PriceLineOptions);
}

// ─── Quick symbols ────────────────────────────────────────────────────────────

const QUICK = ['SPY', 'QQQ', 'NQ', 'ES', 'TSLA', 'NVDA', 'AAPL', 'MSFT'];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ICTDashboardPage() {
  const [symbol, setSymbol]         = useState('SPY');
  const [inputVal, setInputVal]     = useState('');
  const [candles, setCandles]       = useState<Candle[]>([]);
  const [price, setPrice]           = useState(0);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [ticks, setTicks]           = useState(0); // clock tick

  const chartRef  = useRef<HTMLDivElement>(null);
  const chartInst = useRef<any>(null);

  // Live clock tick every second
  useEffect(() => {
    const id = setInterval(() => setTicks(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const load = useCallback(async (sym: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/ict?symbol=${encodeURIComponent(sym)}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? 'Failed to load');
      setCandles(json.candles ?? []);
      setPrice(json.currentPrice ?? 0);
    } catch (e: any) {
      setError(e.message ?? 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(symbol); }, [symbol, load]);

  // ── ICT Level calculations ────────────────────────────────────────────────────
  const levels = useMemo((): ICTLevels => {
    if (!candles.length) return { asia: null, london: null, monday: null, prevDay: null, premarket: null, vwap: null, orb: null };

    const today      = todayET();
    const yesterday  = prevWeekday(today);
    const monday     = getMondayOf(today);

    // Session windows (ET→UTC)
    const asiaStart  = etToUtc(yesterday, 20);
    const asiaEnd    = etToUtc(today,     0);
    const lonStart   = etToUtc(today, 3);
    const lonEnd     = etToUtc(today, 8);
    const pmStart    = etToUtc(today, 8);
    const pmEnd      = etToUtc(today, 9, 30);
    const nyStart    = etToUtc(today, 9, 30);
    const nyEnd      = etToUtc(today, 16);
    const pdStart    = etToUtc(yesterday, 9, 30);
    const pdEnd      = etToUtc(yesterday, 16);
    const monStart   = etToUtc(monday, 9, 30);
    const monEnd     = etToUtc(monday, 16);
    const orbEnd     = etToUtc(today, 9, 35); // 5-min ORB

    const asia     = calcSessionRange(candles, asiaStart, asiaEnd);
    const london   = calcSessionRange(candles, lonStart,  lonEnd);
    const premarket= calcSessionRange(candles, pmStart,   pmEnd);
    const prevDay  = calcSessionRange(candles, pdStart,   pdEnd);
    const monday_r = calcSessionRange(candles, monStart,  monEnd);
    const orb_r    = calcSessionRange(candles, nyStart,   orbEnd);
    const vwap     = calcVWAP(candles, nyStart);

    return {
      asia,
      london,
      monday: monday_r,
      prevDay: prevDay ? { high: prevDay.high, low: prevDay.low, mid: prevDay.mid } : null,
      premarket: premarket ? { high: premarket.high, low: premarket.low, mid: premarket.mid } : null,
      vwap,
      orb: orb_r ? { high: orb_r.high, low: orb_r.low, mid: orb_r.mid } : null,
    };
  }, [candles]);

  const sweeps = useMemo(() => detectSweeps(candles.slice(-200), levels), [candles, levels]);
  const biasResult = useMemo(() => calcBias(candles, levels, sweeps, price), [candles, levels, sweeps, price]);
  const probScore  = useMemo(() => calcProbabilityScore(biasResult, sweeps, levels, price), [biasResult, sweeps, levels, price]);
  const tradeZones = useMemo(() => price > 0 ? calcTradeZones(price, biasResult, levels) : null, [price, biasResult, levels]);
  const sessionTimers = useMemo(() => getSessionCountdowns(), [ticks]); // eslint-disable-line

  // ── Chart ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current || !candles.length) return;

    if (chartInst.current) { chartInst.current.remove(); chartInst.current = null; }

    const chart = createChart(chartRef.current, {
      width:  chartRef.current.clientWidth,
      height: 420,
      layout: { background: { color: '#ffffff' }, textColor: '#374151', fontSize: 11 },
      grid:   { vertLines: { color: '#f3f4f6' }, horzLines: { color: '#f3f4f6' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#e5e7eb' },
      timeScale: { borderColor: '#e5e7eb', timeVisible: true, secondsVisible: false },
    });
    chartInst.current = chart;

    // Candlestick
    const cs = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e', downColor: '#ef4444',
      borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    });
    cs.setData(candles.map(c => ({ time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close })));

    // Session levels
    const c = SESSION_COLORS;
    if (levels.asia)     { addLevel(cs, levels.asia.high, c.asia,    'Asia H');  addLevel(cs, levels.asia.low,  c.asia,    'Asia L');  addLevel(cs, levels.asia.mid,  c.asia,    'Asia Mid', false); }
    if (levels.london)   { addLevel(cs, levels.london.high, c.london, 'Lon H');  addLevel(cs, levels.london.low, c.london, 'Lon L');  addLevel(cs, levels.london.mid, c.london, 'Lon Mid', false); }
    if (levels.monday)   { addLevel(cs, levels.monday.high, c.monday, 'Mon H');  addLevel(cs, levels.monday.low, c.monday, 'Mon L');  addLevel(cs, levels.monday.mid, c.monday, 'Mon Mid', false); }
    if (levels.prevDay)  { addLevel(cs, levels.prevDay.high, c.prevDay,'PDH');   addLevel(cs, levels.prevDay.low, c.prevDay,'PDL'); }
    if (levels.premarket){ addLevel(cs, levels.premarket.high, c.premarket,'PMH'); addLevel(cs, levels.premarket.low, c.premarket,'PML'); }
    if (levels.orb)      { addLevel(cs, levels.orb.high, c.orb,   'ORB H', false); addLevel(cs, levels.orb.low, c.orb, 'ORB L', false); }
    if (levels.vwap)     { addLevel(cs, levels.vwap, c.vwap, 'VWAP', false); }

    // Sweep markers
    const markers = sweeps.map(s => ({
      time: s.time as any,
      position: s.type === 'bullish' ? 'belowBar' : 'aboveBar',
      color:    s.type === 'bullish' ? '#22c55e' : '#ef4444',
      shape:    s.type === 'bullish' ? 'arrowUp' : 'arrowDown',
      text:     s.type === 'bullish' ? `▲ ${s.levelName}` : `▼ ${s.levelName}`,
      size: 1,
    } as any));
    if (markers.length) createSeriesMarkers(cs, markers);

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth });
    });
    if (chartRef.current) ro.observe(chartRef.current);

    return () => { ro.disconnect(); chart.remove(); chartInst.current = null; };
  }, [candles, levels, sweeps]);

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const fmt = (n: number | null | undefined, d = 2) => n != null ? `$${n.toFixed(d)}` : '--';
  const pct = (n: number | null | undefined) => n != null ? `${(n * 100).toFixed(1)}%` : '--';

  const biasColor = biasResult.bias === 'bullish' ? 'text-green-700' : biasResult.bias === 'bearish' ? 'text-red-700' : 'text-gray-600';
  const biasBg    = biasResult.bias === 'bullish' ? 'bg-green-50 border-green-200' : biasResult.bias === 'bearish' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200';
  const scoreColor = probScore >= 7 ? 'text-green-700' : probScore >= 5 ? 'text-amber-700' : 'text-red-700';

  return (
    <AppShell title="ICT / CRT Liquidity Dashboard">
      <div className="space-y-4">

        {/* ── Header row ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Symbol selector */}
          <div className="flex flex-wrap items-center gap-2">
            {QUICK.map(q => (
              <button key={q} onClick={() => setSymbol(q)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${symbol === q ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'}`}>
                {q}
              </button>
            ))}
            <div className="flex gap-1">
              <input value={inputVal} onChange={e => setInputVal(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && inputVal && (setSymbol(inputVal), setInputVal(''))}
                placeholder="Custom…" className="w-24 border border-gray-200 rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-200" />
              <button onClick={() => inputVal && (setSymbol(inputVal), setInputVal(''))}
                className="px-3 py-1.5 bg-purple-600 text-white rounded-xl text-xs font-semibold hover:bg-purple-700 transition">Go</button>
            </div>
            <button onClick={() => load(symbol)} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:border-purple-300 transition disabled:opacity-50">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          {/* Session timers */}
          <div className="flex flex-wrap gap-2">
            {sessionTimers.map(t => (
              <div key={t.label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition ${t.isActive ? 'border-transparent text-white' : 'bg-white border-gray-200 text-gray-600'}`}
                style={t.isActive ? { backgroundColor: t.color } : {}}>
                <Clock size={11} />
                <span>{t.label}:</span>
                <span className="font-mono font-bold">
                  {t.isActive ? 'LIVE' : fmtCountdown(t.secsUntil)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            <strong>Error: </strong>{error}
          </div>
        )}

        {/* ── Main grid ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

          {/* Chart — 2/3 width */}
          <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Chart legend */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-3 pb-2 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-700">{symbol} · 5m</span>
              {price > 0 && <span className="text-xs font-mono font-bold text-gray-900">{fmt(price)}</span>}
              {([
                ['Asia', SESSION_COLORS.asia], ['London', SESSION_COLORS.london],
                ['Monday', SESSION_COLORS.monday], ['Prev Day', SESSION_COLORS.prevDay],
                ['VWAP', SESSION_COLORS.vwap], ['ORB', SESSION_COLORS.orb],
              ] as [string, string][]).map(([label, color]) => (
                <span key={label} className="flex items-center gap-1 text-xs text-gray-500">
                  <span className="inline-block w-3 h-0.5" style={{ backgroundColor: color }} />
                  {label}
                </span>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-[420px]">
                <div className="h-10 w-10 rounded-full border-4 border-purple-200 border-t-purple-600 animate-spin" />
              </div>
            ) : (
              <div ref={chartRef} className="w-full" />
            )}
          </div>

          {/* Right panel — 1/3 width */}
          <div className="flex flex-col gap-3">

            {/* Market Bias */}
            <div className={`rounded-2xl border p-4 ${biasBg}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Market Bias</p>
              <div className={`flex items-center gap-2 mb-3 ${biasColor}`}>
                {biasResult.bias === 'bullish' ? <TrendingUp size={22} /> : biasResult.bias === 'bearish' ? <TrendingDown size={22} /> : <Minus size={22} />}
                <span className="text-2xl font-bold capitalize">{biasResult.bias}</span>
              </div>
              <div className="space-y-1">
                {biasResult.factors.slice(0, 5).map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${f.toLowerCase().includes('bull') || f.toLowerCase().includes('above') ? 'bg-green-500' : 'bg-red-400'}`} />
                    {f}
                  </div>
                ))}
              </div>
            </div>

            {/* Probability Score */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Confluence Score</p>
              <div className="flex items-end gap-2">
                <span className={`text-4xl font-bold ${scoreColor}`}>{probScore}</span>
                <span className="text-gray-400 text-lg mb-1">/10</span>
              </div>
              <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${probScore * 10}%`, backgroundColor: probScore >= 7 ? '#16a34a' : probScore >= 5 ? '#d97706' : '#dc2626' }} />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                {probScore >= 8 ? 'Strong confluence — high-conviction setup' : probScore >= 6 ? 'Moderate confluence — proceed with caution' : probScore >= 4 ? 'Weak confluence — wait for confirmation' : 'Low confluence — no trade'}
              </p>
            </div>

            {/* Trade Assistant */}
            {tradeZones && biasResult.bias !== 'neutral' ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Target size={14} className="text-purple-600" />
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Trade Assistant</p>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center py-1.5 px-2.5 bg-blue-50 rounded-lg">
                    <span className="text-gray-500 font-medium">Entry Zone</span>
                    <span className="font-bold text-blue-700 font-mono">{fmt(tradeZones.entry)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 px-2.5 bg-red-50 rounded-lg">
                    <span className="text-gray-500 font-medium">Stop Loss</span>
                    <span className="font-bold text-red-700 font-mono">{fmt(tradeZones.stop)}</span>
                  </div>
                  <div className="border-t border-gray-100 pt-2 space-y-1.5">
                    {[
                      { label: 'Target 1 (1.5R)', val: tradeZones.t1, color: 'text-green-600' },
                      { label: 'Target 2 (2.5R)', val: tradeZones.t2, color: 'text-green-700' },
                      { label: 'Target 3 (4.0R)', val: tradeZones.t3, color: 'text-green-800' },
                    ].map(t => (
                      <div key={t.label} className="flex justify-between items-center">
                        <span className="text-gray-400">{t.label}</span>
                        <span className={`font-bold font-mono ${t.color}`}>{fmt(t.val)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-gray-100">
                    <span className="text-gray-500 font-medium">Risk / Reward</span>
                    <span className="font-bold text-purple-700">{tradeZones.rr2}:1</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 font-medium">Risk (pts)</span>
                    <span className="font-mono text-gray-700">{fmt(tradeZones.riskPts)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 text-center">
                <Activity size={20} className="text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-400">Awaiting directional bias for trade zones</p>
              </div>
            )}

            {/* Session Notes */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Session Notes</p>
              <div className="space-y-1.5 text-xs text-gray-600">
                {levels.vwap   && <p>• VWAP at {fmt(levels.vwap)} — price is {price > levels.vwap ? 'above' : 'below'}</p>}
                {levels.orb    && <p>• ORB range: {fmt(levels.orb.low)} – {fmt(levels.orb.high)}</p>}
                {levels.asia   && <p>• Asia range: {fmt(levels.asia.low)} – {fmt(levels.asia.high)}</p>}
                {levels.london && <p>• London range: {fmt(levels.london.low)} – {fmt(levels.london.high)}</p>}
                {levels.prevDay && <p>• Prev day: PDH {fmt(levels.prevDay.high)} / PDL {fmt(levels.prevDay.low)}</p>}
                {sweeps.length > 0 && <p>• {sweeps.length} liquidity sweep{sweeps.length > 1 ? 's' : ''} detected today</p>}
                {!levels.vwap && !levels.orb && !levels.asia && <p className="text-gray-400">No session data available yet.</p>}
              </div>
            </div>

          </div>
        </div>

        {/* ── Level quick-reference grid ──────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { label: 'Asia H',  val: levels.asia?.high,     color: '#7c3aed' },
            { label: 'Asia L',  val: levels.asia?.low,      color: '#7c3aed' },
            { label: 'Lon H',   val: levels.london?.high,   color: '#2563eb' },
            { label: 'Lon L',   val: levels.london?.low,    color: '#2563eb' },
            { label: 'PDH',     val: levels.prevDay?.high,  color: '#6b7280' },
            { label: 'PDL',     val: levels.prevDay?.low,   color: '#6b7280' },
            { label: 'Mon H',   val: levels.monday?.high,   color: '#d97706' },
            { label: 'Mon L',   val: levels.monday?.low,    color: '#d97706' },
            { label: 'PM H',    val: levels.premarket?.high, color: '#0891b2' },
            { label: 'PM L',    val: levels.premarket?.low,  color: '#0891b2' },
            { label: 'VWAP',    val: levels.vwap,           color: '#f97316' },
            { label: 'ORB Mid', val: levels.orb?.mid,       color: '#16a34a' },
          ].map(({ label, val, color }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color }}>{label}</span>
              <span className="text-xs font-mono text-gray-800">{val != null ? val.toFixed(2) : '--'}</span>
            </div>
          ))}
        </div>

        {/* ── Liquidity sweeps feed ───────────────────────────────────────── */}
        {sweeps.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Liquidity Sweeps Detected
            </p>
            <div className="flex flex-wrap gap-2">
              {sweeps.map((s, i) => (
                <div key={i} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium ${s.type === 'bullish' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  {s.type === 'bullish' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  <span>{s.type === 'bullish' ? 'Bullish' : 'Bearish'} Sweep:</span>
                  <span className="font-semibold">{s.levelName}</span>
                  <span className="font-mono text-gray-500">@ {s.level.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-xs text-gray-400 text-center pb-2">
          ICT/CRT concepts for education only. All levels are algorithmically estimated. Always confirm in your broker before trading.
        </p>
      </div>
    </AppShell>
  );
}

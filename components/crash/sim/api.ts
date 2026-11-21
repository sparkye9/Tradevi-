'use client';
/** Client helpers and response types for /api/crash/history. */
import type { evaluate, historicalChain, historicalTrade, lab, replay, reveal, scanWindow } from '@/lib/crash/history/service';

export type ReplayData = Awaited<ReturnType<typeof replay>>;
export type RevealData = Awaited<ReturnType<typeof reveal>>;
export type ChainData = Awaited<ReturnType<typeof historicalChain>>;
export type TradeData = Awaited<ReturnType<typeof historicalTrade>>;
export type EvaluateData = Awaited<ReturnType<typeof evaluate>>;
export type LabData = Awaited<ReturnType<typeof lab>>;
export type ScanData = Awaited<ReturnType<typeof scanWindow>>;

export interface StatusData {
  builtAt: string;
  firstSession: string | null;
  lastSession: string | null;
  sessions: number;
  series: { id: string; label: string; source: string; first: string | null; last: string | null; vintage: boolean; revisable: boolean; license?: string }[];
  errors: { id: string; error: string }[];
  validation: { id: string; issue: string; count: number; example?: string }[];
  options: { symbol: string; dates: number; first: string | null; last: string | null; source: string | null }[];
  windows: { id: string; label: string; start: string; end: string; focus: string[]; symbols: string[] }[];
}

export async function historyPost<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/crash/history', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as T & { error?: string };
  if (!res.ok || (j as { error?: string }).error) throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
  return j;
}

export function storageGet<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function storageSet(key: string, v: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage blocked or full */
  }
}

export function download(name: string, content: string, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

export const SIM_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'KRE'];

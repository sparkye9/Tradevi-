'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import SourceTag from '@/components/ui/SourceTag';
import DataUnavailable from '@/components/ui/DataUnavailable';
import OpportunityCard from '@/components/scan/OpportunityCard';
import { computeOpportunityScore, deriveDirection, deriveTimeframe, generateReason, generateBeginnerReason } from '@/lib/opportunityScore';
import { computeFuturesBias, deriveMarketMood } from '@/lib/futuresBias';
import { isBeginner, volumeLabel } from '@/lib/labels';
import { diffOpportunityScores } from '@/lib/notifications';
import type { FinvizQuote, FinvizFuture, FinvizResult } from '@/lib/finviz';
import { useTradeviStore } from '@/store/tradeviStore';
import { useNotificationsStore } from '@/store/notificationsStore';

const INDEX_TICKERS = ['SPY', 'QQQ', 'IWM', 'GLD'];
const RANK_MEDALS = ['🥇', '🥈', '🥉', '4', '5'];

function IndexStatCard({ q, sym }: { q: FinvizQuote | undefined; sym: string }) {
  if (!q) {
    return (
      <div className="card flex flex-col gap-1">
        <span className="label">{sym}</span>
        <span className="value text-2xl">--</span>
      </div>
    );
  }
  const chgColor = (q.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400';
  return (
    <div className="card card-hover flex flex-col gap-1">
      <span className="label">{q.symbol}</span>
      <span className="value text-2xl">{q.price !== null ? `$${q.price.toFixed(2)}` : '--'}</span>
      <span className={`font-mono font-semibold text-sm ${chgColor}`}>
        {q.changePercent !== null ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%` : '--'}
      </span>
    </div>
  );
}

function MoodCard({ read, loading }: { read: ReturnType<typeof computeFuturesBias> | null; loading: boolean }) {
  if (loading || !read) {
    return (
      <div className="card">
        <div className="text-xs text-gray-600 animate-pulse">Reading today&apos;s market mood...</div>
      </div>
    );
  }
  const mood = deriveMarketMood(read);
  const color = read.bias === 'BULLISH' ? 'text-emerald-400' : read.bias === 'BEARISH' ? 'text-red-400' : 'text-amber-400';
  const border = read.bias === 'BULLISH' ? 'border-emerald-500/30' : read.bias === 'BEARISH' ? 'border-red-500/30' : 'border-amber-500/20';
  return (
    <div className={`card border ${border} flex items-center justify-between gap-4 flex-wrap`}>
      <div>
        <span className="label">Today&apos;s Market Mood</span>
        <div className={`text-xl font-bold font-mono mt-1 ${color}`}>{mood}</div>
        <p className="text-xs text-gray-500 mt-1 max-w-md">{read.playbook[0]}</p>
      </div>
      <div className="text-right shrink-0">
        <div className={`text-2xl font-black font-mono ${color}`}>{read.confidence}%</div>
        <div className="text-[10px] text-gray-600 uppercase tracking-wider">Confidence</div>
      </div>
    </div>
  );
}

function RankRow({
  rank,
  q,
  rvolThreshold,
  expanded,
  onToggle,
}: {
  rank: number;
  q: FinvizQuote;
  rvolThreshold: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { experienceMode } = useTradeviStore();
  const beginner = isBeginner(experienceMode);
  const score = computeOpportunityScore(q, rvolThreshold);
  const direction = deriveDirection(q);
  const scoreColor = score >= 75 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-gray-500';
  const dirColor = direction === 'BULLISH' ? 'text-emerald-400' : direction === 'BEARISH' ? 'text-red-400' : 'text-amber-400';

  return (
    <div className="rounded-2xl border border-[#1e1e1e] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3.5 hover:bg-[#161616] transition-colors text-left"
      >
        <span className="text-lg w-6 text-center shrink-0">{RANK_MEDALS[rank] ?? rank + 1}</span>
        <span className="text-white font-mono font-bold text-base w-16 shrink-0">{q.symbol}</span>
        <span className="text-gray-400 font-mono text-sm w-20 shrink-0">
          {q.price !== null ? `$${q.price.toFixed(2)}` : '--'}
        </span>
        <span className={`font-mono text-xs font-bold w-14 shrink-0 ${dirColor}`}>
          {beginner ? (direction === 'BULLISH' ? 'BUY' : direction === 'BEARISH' ? 'SELL' : 'WATCH') : direction}
        </span>
        <span className="text-xs text-gray-600 flex-1 truncate hidden sm:block">{volumeLabel(q, experienceMode)}</span>
        <span className={`font-mono font-bold text-sm shrink-0 ${scoreColor}`}>{score}</span>
        <span className="text-gray-600 text-xs shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="p-3 pt-0">
          <OpportunityCard q={q} rvolThreshold={rvolThreshold} timeframe={deriveTimeframe(q, rvolThreshold)} />
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { watchlist, rvolThreshold, experienceMode } = useTradeviStore();
  const { lastScores, setLastScores, push: pushNotification } = useNotificationsStore();
  const beginner = isBeginner(experienceMode);
  const [indexData, setIndexData] = useState<FinvizResult<FinvizQuote> | null>(null);
  const [watchlistData, setWatchlistData] = useState<FinvizResult<FinvizQuote> | null>(null);
  const [futuresData, setFuturesData] = useState<FinvizResult<FinvizFuture> | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedRank, setExpandedRank] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [idxRes, wlRes, futRes] = await Promise.allSettled([
        fetch(`/api/finviz/screener?tickers=${INDEX_TICKERS.join(',')}`).then((r) => r.json()),
        fetch(`/api/finviz/screener?tickers=${watchlist.join(',')}`).then((r) => r.json()),
        fetch('/api/finviz/futures').then((r) => r.json()),
      ]);
      if (idxRes.status === 'fulfilled') setIndexData(idxRes.value);
      if (wlRes.status === 'fulfilled') setWatchlistData(wlRes.value);
      if (futRes.status === 'fulfilled') setFuturesData(futRes.value);
      setLoading(false);
    }
    load();
  }, [watchlist]);

  // Turn this refresh's rankings into notifications — new top entrants,
  // crossings into high-confidence territory, and weakening momentum.
  useEffect(() => {
    if (!watchlistData || watchlistData.sourceError) return;
    const topRanked = (watchlistData.data ?? [])
      .filter((q) => q.price !== null)
      .map((q) => ({ symbol: q.symbol, score: computeOpportunityScore(q, rvolThreshold) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const { toPush, nextScores } = diffOpportunityScores(lastScores, topRanked);
    toPush.forEach((n) => pushNotification(n));
    setLastScores(nextScores);
    // Only re-run when a fresh fetch lands, not on every notification-store change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlistData]);

  const indexQuotes = indexData?.data ?? [];
  const wlQuotes = watchlistData?.data ?? [];
  const futures = futuresData?.data ?? [];

  const spy = indexQuotes.find((q) => q.symbol === 'SPY');
  const qqq = indexQuotes.find((q) => q.symbol === 'QQQ');
  const iwm = indexQuotes.find((q) => q.symbol === 'IWM');
  const gld = indexQuotes.find((q) => q.symbol === 'GLD');

  const biasRead = futures.length > 0 ? computeFuturesBias(futures) : null;

  const ranked = [...wlQuotes]
    .filter((q) => q.price !== null)
    .sort((a, b) => computeOpportunityScore(b, rvolThreshold) - computeOpportunityScore(a, rvolThreshold))
    .slice(0, 5);

  const top = ranked[0] ?? null;
  const topScore = top ? computeOpportunityScore(top, rvolThreshold) : 0;
  const topDirection = top ? deriveDirection(top) : 'WATCH';
  const topTimeframe = top ? deriveTimeframe(top, rvolThreshold) : 'intraday';
  const topReason = top ? (beginner ? generateBeginnerReason(top) : generateReason(top)) : '';

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">What should I trade today?</p>
      </div>

      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-3 w-12 bg-[#222] rounded mb-3" />
              <div className="h-7 w-24 bg-[#222] rounded mb-2" />
              <div className="h-4 w-16 bg-[#222] rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Index stat grid */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <IndexStatCard q={spy} sym="SPY" />
          <IndexStatCard q={qqq} sym="QQQ" />
          <IndexStatCard q={iwm} sym="IWM" />
          <IndexStatCard q={gld} sym="GLD" />
        </div>
      )}

      {/* Today's Market Mood */}
      <MoodCard read={biasRead} loading={loading && futures.length === 0} />
      {futuresData?.sourceError && <DataUnavailable reason={futuresData.sourceError} />}

      {/* Today's Best Trade */}
      <section>
        <span className="label">Today&apos;s Best Trade</span>
        {watchlistData?.sourceError ? (
          <div className="mt-2"><DataUnavailable reason={watchlistData.sourceError} /></div>
        ) : loading ? (
          <div className="card animate-pulse h-48 mt-2" />
        ) : !top ? (
          <div className="card text-gray-600 text-sm mt-2">No qualifying setups on your watchlist right now.</div>
        ) : (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className={`font-bold ${topScore >= 75 ? 'text-emerald-400' : 'text-amber-400'}`}>Score {topScore}</span>
              <span>·</span>
              <span>{topDirection === 'BULLISH' ? (beginner ? 'Buy' : 'Bullish') : topDirection === 'BEARISH' ? (beginner ? 'Sell' : 'Bearish') : 'Watch'}</span>
              <span>·</span>
              <span>{topReason}</span>
            </div>
            <OpportunityCard q={top} rvolThreshold={rvolThreshold} timeframe={topTimeframe} defaultOptionsOpen />
          </div>
        )}
      </section>

      {/* Top 5 ranked */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <span className="label">Today&apos;s Best Opportunities</span>
          <Link href="/scanner" className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors">Full scanner →</Link>
        </div>
        {watchlistData?.sourceError ? (
          <DataUnavailable reason={watchlistData.sourceError} />
        ) : ranked.length === 0 && !loading ? (
          <div className="card text-gray-600 text-sm">No candidates yet.</div>
        ) : (
          <div className="space-y-2">
            {ranked.map((q, i) => (
              <RankRow
                key={q.symbol}
                rank={i}
                q={q}
                rvolThreshold={rvolThreshold}
                expanded={expandedRank === i}
                onToggle={() => setExpandedRank((p) => (p === i ? null : i))}
              />
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-gray-700 text-center pt-2">
        Structure confirmed on TradingView only — CHOCH, BOS, FVG, VWAP not computed here.
      </p>
    </div>
  );
}

'use client';
import { useState } from 'react';

// Extracted from the old standalone Power Hour page — kept verbatim since the
// educational content is genuinely good, just no longer its own destination.
export default function PowerHourGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-[#111111] transition-colors"
      >
        <span className="text-sm font-bold text-gray-300">📖 Power Hour Trading Guide</span>
        <span className="text-gray-500 text-xs">{open ? '▲ hide' : '▼ show'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 text-sm text-gray-400 border-t border-[#1e1e1e] pt-4">
          <div>
            <p className="text-gray-200 font-semibold mb-1">What is Power Hour?</p>
            <p>3:00 PM – 4:00 PM ET. The last hour of the regular session. Institutional money, hedge funds, and pension funds make final position adjustments. Volume spikes. Trends accelerate or reverse hard.</p>
          </div>

          <div className="space-y-3">
            <p className="text-gray-200 font-semibold">The 3 Types of Power Hour</p>

            <div className="border border-emerald-500/20 rounded-xl p-3 space-y-1">
              <p className="text-emerald-400 font-bold text-xs uppercase tracking-wide">1. Trend Continuation</p>
              <p>Market trends all day and keeps going. QQQ bullish, higher highs, higher lows, strong breadth. Buyers pile in at 3 PM. New highs into the close. Calls gain rapidly.</p>
              <p className="text-xs text-gray-600">→ Easiest Power Hour to trade. Ride momentum.</p>
            </div>

            <div className="border border-amber-500/20 rounded-xl p-3 space-y-1">
              <p className="text-amber-400 font-bold text-xs uppercase tracking-wide">2. Reversal</p>
              <p>Market trends one way all day then flips. QQQ down all day, sellers exhaust, VIX starts falling, buyers step in. Sharp rally into the close traps the late shorts.</p>
              <p className="text-xs text-gray-600">→ Higher risk. Wait for confirmation before entering.</p>
            </div>

            <div className="border border-gray-700 rounded-xl p-3 space-y-1">
              <p className="text-gray-400 font-bold text-xs uppercase tracking-wide">3. Chop</p>
              <p>Sideways, low volatility, no direction. Usually happens before major news or when institutions are waiting. Best trade: no trade.</p>
              <p className="text-xs text-gray-600">→ If you can&apos;t identify the type by 3:05, sit out.</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-emerald-400 font-semibold text-xs uppercase tracking-wide mb-2">Bullish Setup</p>
              {['Higher lows forming', 'Price above VWAP', 'Price above 9 EMA', 'Volume increasing after 3 PM', 'QQQ/SPY making new intraday highs', 'Market breadth positive'].map((item) => (
                <div key={item} className="flex items-center gap-2 text-xs">
                  <span className="text-emerald-400">✅</span> {item}
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <p className="text-red-400 font-semibold text-xs uppercase tracking-wide mb-2">Bearish Setup</p>
              {['Lower highs forming', 'Price below VWAP', 'Repeated rejection at resistance', 'Selling volume increasing', 'QQQ/SPY making new intraday lows', 'Breadth deteriorating'].map((item) => (
                <div key={item} className="flex items-center gap-2 text-xs">
                  <span className="text-red-400">✅</span> {item}
                </div>
              ))}
            </div>
          </div>

          <div className="border border-[#2a2a2a] rounded-xl p-4 space-y-2">
            <p className="text-white font-bold text-xs uppercase tracking-wide">At 2:45 PM Ask Yourself</p>
            {[
              'Is price above or below VWAP?',
              'Are higher lows forming?',
              'Is volume increasing?',
              'Is the trend intact on the 15-min chart?',
              'Are QQQ and SPY supporting the move?',
            ].map((q, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-gray-300">
                <span className="text-amber-400 font-bold shrink-0">{i + 1}.</span> {q}
              </div>
            ))}
            <p className="text-xs text-gray-600 mt-2 pt-2 border-t border-[#1e1e1e]">
              4 of 5 yes → decent continuation probability. 2 or fewer yes → be careful. Theta and end-of-day profit-taking can hit hard.
            </p>
          </div>

          <div className="border border-emerald-500/15 rounded-xl p-4 space-y-1">
            <p className="text-white font-bold text-xs uppercase tracking-wide mb-2">For Options Specifically</p>
            {[
              'Delta > 0.50 — high enough to move with the underlying',
              'Trend aligned with QQQ/SPY',
              'Strong relative strength',
              'Increasing volume after 3 PM',
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-gray-300">
                <span className="text-emerald-400 shrink-0">→</span> {item}
              </div>
            ))}
            <p className="text-xs text-gray-600 mt-2 pt-2 border-t border-[#1e1e1e]">
              Watch volume after 3:30 PM more than price alone. A lot of traders sell winners between 3:45 and 4:00 PM — a stock can look great at 3:15 and still pull back into the close.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

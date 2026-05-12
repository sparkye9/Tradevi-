'use client';

import { AppShell } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Sparkles, TrendingUp, Shield, BookOpen } from 'lucide-react';

const sections = [
  {
    title: 'Market Breadth',
    description: 'Track the broad health of the market with sector momentum, major index internals, and bullish/bearish breadth signals.',
    highlights: ['SPY vs QQQ relative strength', 'Large-cap leadership', 'risk-on market breadth'],
  },
  {
    title: 'Macro Pulse',
    description: 'Monitor the key macro drivers that matter for stocks and options, including interest rates, volatility, and sector rotation.',
    highlights: ['Treasury yield drift', 'VIX sentiment', 'commodity flow'],
  },
  {
    title: 'Earnings & Catalyst Watch',
    description: 'Get early warning on upcoming earnings windows, major economic prints, and potential volatility catalysts.',
    highlights: ['Upcoming earnings', 'Fed calendar', 'macro data releases'],
  },
  {
    title: 'Technical Setups',
    description: 'Review the top technical themes across the market with trend, support/resistance, and momentum-based watch lists.',
    highlights: ['Sector rotation', 'trend strength', 'key support/resistance'],
  },
];

export default function MarketAnalysisPage() {
  const hasLiveMarketFeed = false;

  return (
    <AppShell title="Market Analysis">
      <div className="space-y-6">
        <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-purple-50 px-3 py-1 text-sm font-semibold text-purple-700">
                <Sparkles size={16} /> Market Analysis
              </div>
              <h1 className="mt-4 text-3xl font-semibold text-gray-900">Weekly market pulse, sector themes, and actionable insights</h1>
              <p className="mt-2 text-sm text-gray-500 max-w-2xl">
                A single page to review the broader market narrative, risk themes, and catalyst calendar before scanning individual opportunities.
              </p>
            </div>
            <Badge variant="purple">Research</Badge>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Sentiment</p>
                <h2 className="mt-2 text-xl font-semibold text-gray-900">Volatility & Breadth</h2>
              </div>
              <TrendingUp className="text-purple-600" />
            </div>
            <div className="space-y-3 text-sm text-gray-600">
              <p>Equity volatility remains muted vs the 20-day average while breadth is showing modest improvement in the top 30 S&P names.</p>
              <ul className="grid gap-2">
                <li className="rounded-2xl border border-gray-100 bg-gray-50 p-3">VIX is holding near 16, supporting lower-premium range trades.</li>
                <li className="rounded-2xl border border-gray-100 bg-gray-50 p-3">SPY/QQQ relative strength still favors growth, but energy and financials are beginning to outperform.</li>
                <li className="rounded-2xl border border-gray-100 bg-gray-50 p-3">Put/call skew remains neutral, leaving room for directional option setups.</li>
              </ul>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Risk Themes</p>
                <h2 className="mt-2 text-xl font-semibold text-gray-900">Macro & Technical</h2>
              </div>
              <Shield className="text-purple-600" />
            </div>
            <div className="space-y-3 text-sm text-gray-600">
              <p>Keep an eye on rate-sensitive names and defensive sectors while the market digests macro updates.</p>
              <ul className="grid gap-2">
                <li className="rounded-2xl border border-gray-100 bg-gray-50 p-3">Treasury yields have paused; any breakout above 4.5% could pressure high-beta tech names.</li>
                <li className="rounded-2xl border border-gray-100 bg-gray-50 p-3">Support is firm at SPY 520 and QQQ 390; a clean hold would favor swing option ideas.</li>
                <li className="rounded-2xl border border-gray-100 bg-gray-50 p-3">Watch volume on breakouts. Weak follow-through is a warning sign for trend continuation plays.</li>
              </ul>
            </div>
          </Card>
        </div>

        {hasLiveMarketFeed ? (
          <div className="grid gap-6 xl:grid-cols-3">
            {sections.map((section) => (
              <Card key={section.title}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{section.title}</h3>
                    <p className="text-sm text-gray-500">{section.description}</p>
                  </div>
                  <BookOpen className="text-purple-600" />
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  {section.highlights.map((item) => (
                    <li key={item} className="rounded-2xl border border-gray-100 bg-gray-50 p-3">• {item}</li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState message="Live market signals are not available yet.">
              <p className="text-xs text-gray-500">
                This page is prepared for when the market analysis feed is connected. Continue using the Scanner and Options Chain for data-backed trade ideas.
              </p>
            </EmptyState>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

'use client';
import { AppShell } from '@/components/layout/AppShell';
import { RiskCalculator } from '@/components/risk/RiskCalculator';
import { Card, CardHeader } from '@/components/ui/Card';
import { useSettingsStore } from '@/store/settingsStore';
import { Button } from '@/components/ui/Button';
import { Shield, AlertTriangle, CheckCircle } from 'lucide-react';

const RULES = [
  { icon: '💰', rule: 'Never risk more than 1–2% of your account on a single trade', why: 'Preserves capital so you can trade another day even after a string of losses.' },
  { icon: '⏰', rule: '0DTE options expire same day — most go to zero', why: 'These require perfect timing. Only experienced traders should use 0DTE.' },
  { icon: '📉', rule: 'Options under $0.25 are lottery tickets', why: 'The math works against you. Low premium = low probability = fast decay.' },
  { icon: '📊', rule: 'Check bid/ask spread before every entry', why: 'A 30%+ spread means you lose 30% the moment you enter. Target under 10%.' },
  { icon: '🎯', rule: 'Always know your stop/invalidation level before entering', why: 'Decisions made in the heat of a trade are emotional. Decide before you enter.' },
  { icon: '📅', rule: 'Avoid holding options through earnings unless intentional', why: 'IV crush can destroy your option value even if you guessed the direction right.' },
  { icon: '🧘', rule: 'If you miss the move, wait for the next setup', why: 'Chasing is how most retail traders lose money. There is always another setup.' },
  { icon: '📝', rule: 'Journal every trade — win or loss', why: 'Pattern recognition in your own behavior is your edge. You cannot improve what you do not measure.' },
];

export default function RiskPage() {
  const settings = useSettingsStore();

  return (
    <AppShell title="Risk & Safety">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Calculator */}
        <div>
          <RiskCalculator />

          {/* Account Settings */}
          <Card className="mt-4">
            <CardHeader title="Account Settings" icon={<Shield size={16} />} />
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">My Broker</label>
                <select
                  value={settings.brokerName}
                  onChange={e => settings.update({ brokerName: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                >
                  <option value="your broker">Select your broker…</option>
                  <option value="Robinhood">Robinhood</option>
                  <option value="TD Ameritrade / thinkorswim">TD Ameritrade / thinkorswim</option>
                  <option value="Charles Schwab">Charles Schwab</option>
                  <option value="Webull">Webull</option>
                  <option value="tastytrade">tastytrade</option>
                  <option value="E*TRADE">E*TRADE</option>
                  <option value="Fidelity">Fidelity</option>
                  <option value="IBKR / Interactive Brokers">IBKR / Interactive Brokers</option>
                  <option value="Moomoo">Moomoo</option>
                  <option value="Tradier">Tradier</option>
                  <option value="Other">Other</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Used to label trade tickets and open the correct broker link.
                  TradeWise never connects to your broker automatically.
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Account Size ($)</label>
                <input
                  type="number" value={settings.accountSize}
                  onChange={e => settings.update({ accountSize: Number(e.target.value) })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Max Risk % per Trade</label>
                <input
                  type="number" step="0.5" min="0.1" max="10"
                  value={settings.maxRiskPercent}
                  onChange={e => settings.update({ maxRiskPercent: Number(e.target.value) })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Recommended: 1–2%. Max loss per trade: ${(settings.accountSize * settings.maxRiskPercent / 100).toFixed(2)}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Rules */}
        <div>
          <Card>
            <CardHeader title="Golden Rules of Options Trading" icon={<CheckCircle size={16} />} />
            <div className="space-y-3">
              {RULES.map((r, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                  <span className="text-xl flex-shrink-0">{r.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{r.rule}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{r.why}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Legal Disclaimer */}
      <Card className="mt-6 border-red-200 bg-red-50">
        <CardHeader title="Important Disclaimer" icon={<AlertTriangle size={16} className="text-red-600" />} />
        <div className="space-y-2 text-sm text-red-800">
          <p><strong>This app is for education, research, alerts, and journaling only.</strong> It does not provide financial advice and does not execute trades.</p>
          <p>• <strong>100%+ potential does not mean likely.</strong> Most cheap options expire worthless.</p>
          <p>• <strong>Cheap options are cheap because they are risky.</strong> Low premium = low probability.</p>
          <p>• <strong>0DTE and short-dated options can go to zero quickly.</strong> You can lose 100% of your premium.</p>
          <p>• <strong>Always confirm manually in your broker</strong> before entering any trade.</p>
          <p>• <strong>Past performance of any strategy does not guarantee future results.</strong></p>
          <p>• <strong>Options trading involves significant risk.</strong> Only trade with money you can afford to lose.</p>
          <p className="mt-2 text-xs text-red-600">
            TradeWise does not store login credentials, does not place trades automatically, and does not bypass any brokerage security measures.
          </p>
        </div>
      </Card>
    </AppShell>
  );
}

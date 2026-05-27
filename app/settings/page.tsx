'use client';

import { useState, useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useSettingsStore } from '@/store/settingsStore';
import {
  Save, RotateCcw, Eye, EyeOff, Volume2, VolumeX, Bell, BellOff,
  Palette, Layout, Brain, Keyboard, List, Shield,
} from 'lucide-react';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const G = '#00ff88';
const R = '#ff3b3b';
const A = '#f59e0b';

// ─── Extended settings (localStorage) ────────────────────────────────────────
interface CockpitSettings {
  emotionalSensitivity: 'high' | 'medium' | 'low';
  colorIntensity: 'high' | 'medium' | 'low';
  layoutDensity: 'compact' | 'comfortable' | 'spacious';
  focusModeDefault: boolean;
  soundOnAlert: boolean;
  soundOnSignal: boolean;
  desktopNotifications: boolean;
  inAppNotifications: boolean;
  watchlistA: string;
  watchlistB: string;
  watchlistC: string;
  hotkeys: { focusMode: string; refresh: string; scanner: string; dashboard: string };
}

const DEFAULT_COCKPIT: CockpitSettings = {
  emotionalSensitivity: 'medium',
  colorIntensity: 'high',
  layoutDensity: 'comfortable',
  focusModeDefault: false,
  soundOnAlert: true,
  soundOnSignal: false,
  desktopNotifications: false,
  inAppNotifications: true,
  watchlistA: 'SPY,QQQ,NVDA,TSLA,AAPL,AMD,META',
  watchlistB: 'PLTR,COIN,MSTR,SOFI,RIVN,LCID',
  watchlistC: 'NQ=F,ES=F,YM=F,GC=F,CL=F',
  hotkeys: { focusMode: 'F', refresh: 'R', scanner: 'S', dashboard: 'D' },
};

function useCockpitSettings() {
  const [settings, setSettings] = useState<CockpitSettings>(DEFAULT_COCKPIT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('cp-settings');
      if (stored) setSettings({ ...DEFAULT_COCKPIT, ...JSON.parse(stored) });
    } catch { /* ignore */ }
    setLoaded(true);
  }, []);

  const save = (updates: Partial<CockpitSettings>) => {
    const next = { ...settings, ...updates };
    setSettings(next);
    try { localStorage.setItem('cp-settings', JSON.stringify(next)); } catch { /* ignore */ }
  };

  return { settings, save, loaded };
}

// ─── UI Primitives ─────────────────────────────────────────────────────────────
function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5" style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center gap-2 mb-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px' }}>
        <span style={{ color: G }}>{icon}</span>
        <span style={{ color: '#f0f0f0', fontWeight: 700, fontSize: '14px' }}>{title}</span>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div style={{ color: '#f0f0f0', fontSize: '13px', fontWeight: 500 }}>{label}</div>
        {sub && <div className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{sub}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange, color = G }: { value: boolean; onChange: (v: boolean) => void; color?: string }) {
  return (
    <button onClick={() => onChange(!value)}
      className="relative w-10 h-5 rounded-full transition-all"
      style={{ background: value ? color : 'rgba(255,255,255,0.1)' }}>
      <div className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
        style={{ background: '#fff', left: value ? '22px' : '2px', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
    </button>
  );
}

function SegmentedControl({ options, value, onChange, color = G }: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
  color?: string;
}) {
  return (
    <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
      {options.map(opt => (
        <button key={opt.value} onClick={() => onChange(opt.value)}
          className="px-3 py-1 rounded text-xs font-semibold transition-all"
          style={{
            background: value === opt.value ? color : 'transparent',
            color: value === opt.value ? '#0d0f14' : '#6b7280',
          }}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function NumberInput({ value, onChange, min, max, step = 1, prefix = '' }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; prefix?: string }) {
  return (
    <div className="flex items-center gap-2">
      {prefix && <span style={{ color: '#6b7280', fontSize: '13px' }}>{prefix}</span>}
      <input type="number" value={value} onChange={e => onChange(Number(e.target.value))}
        min={min} max={max} step={step}
        className="w-24 rounded-lg px-3 py-1.5 text-sm outline-none text-right"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#f0f0f0', fontFamily: '"JetBrains Mono",monospace' }} />
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full rounded-lg px-3 py-2 text-sm outline-none"
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#f0f0f0' }} />
  );
}

function KeybindInput({ value, onChange, action }: { value: string; onChange: (v: string) => void; action: string }) {
  const [listening, setListening] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span style={{ color: '#6b7280', fontSize: '12px', width: 80 }}>{action}</span>
      <button
        className="px-3 py-1.5 rounded font-mono text-xs font-bold transition-all"
        style={{
          background: listening ? `${G}20` : 'rgba(255,255,255,0.06)',
          border: `1px solid ${listening ? G : 'rgba(255,255,255,0.1)'}`,
          color: listening ? G : '#f0f0f0',
          minWidth: 60,
        }}
        onClick={() => setListening(true)}
        onBlur={() => setListening(false)}
        onKeyDown={e => {
          if (!listening) return;
          e.preventDefault();
          if (e.key !== 'Escape') onChange(e.key.toUpperCase());
          setListening(false);
        }}>
        {listening ? 'Press key…' : value || '—'}
      </button>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const store = useSettingsStore();
  const { settings: cp, save: saveCp, loaded } = useCockpitSettings();
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!loaded) {
    return (
      <AppShell title="Settings">
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '2px solid rgba(255,255,255,0.06)', borderTopColor: G }} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Settings">
      <div className="mb-4">
        <div className="sec-label mb-1">Core Question</div>
        <h1 style={{ color: '#f0f0f0', fontWeight: 700, fontSize: '18px' }}>How should my environment behave?</h1>
      </div>

      {/* Save bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 rounded-xl mb-6 -mx-4"
        style={{ background: 'rgba(17,19,24,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ color: '#6b7280', fontSize: '13px' }}>Changes are saved automatically</span>
        <div className="flex items-center gap-3">
          <button onClick={() => { store.reset(); setSaved(true); setTimeout(() => setSaved(false), 2000); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#6b7280' }}>
            <RotateCcw size={12} />Reset Defaults
          </button>
          <button onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-semibold transition-all"
            style={{ background: saved ? `${G}20` : G, color: saved ? G : '#0d0f14', border: saved ? `1px solid ${G}` : 'none' }}>
            <Save size={12} />{saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="space-y-5 max-w-3xl">
        {/* Focus & Layout */}
        <Section icon={<Eye size={16} />} title="Focus & Layout">
          <Row label="Focus Mode Default" sub="Hide sidebar and collapse secondary panels on page load">
            <Toggle value={cp.focusModeDefault} onChange={v => saveCp({ focusModeDefault: v })} />
          </Row>
          <Row label="Layout Density" sub="Controls spacing and panel sizing across all pages">
            <SegmentedControl
              options={[{ label: 'Compact', value: 'compact' }, { label: 'Normal', value: 'comfortable' }, { label: 'Spacious', value: 'spacious' }]}
              value={cp.layoutDensity} onChange={v => saveCp({ layoutDensity: v as CockpitSettings['layoutDensity'] })} />
          </Row>
          <Row label="Color Intensity" sub="Brightness of glow effects and accent colors">
            <SegmentedControl
              options={[{ label: 'Low', value: 'low' }, { label: 'Medium', value: 'medium' }, { label: 'High', value: 'high' }]}
              value={cp.colorIntensity} onChange={v => saveCp({ colorIntensity: v as CockpitSettings['colorIntensity'] })} color={A} />
          </Row>
        </Section>

        {/* Emotional Protection */}
        <Section icon={<Brain size={16} />} title="Emotional Protection">
          <Row label="Warning Sensitivity" sub="How aggressively the system warns about emotional trading patterns">
            <SegmentedControl
              options={[{ label: 'Low', value: 'low' }, { label: 'Medium', value: 'medium' }, { label: 'High', value: 'high' }]}
              value={cp.emotionalSensitivity} onChange={v => saveCp({ emotionalSensitivity: v as CockpitSettings['emotionalSensitivity'] })} color={R} />
          </Row>
          <Row label="Account Size ($)" sub="Used to calculate position sizing and risk limits">
            <NumberInput value={store.accountSize} onChange={v => store.update({ accountSize: v })} min={100} step={500} prefix="$" />
          </Row>
          <Row label="Max Risk Per Trade (%)" sub="Enforced across all trade quality checks">
            <NumberInput value={store.maxRiskPercent} onChange={v => store.update({ maxRiskPercent: v })} min={0.1} max={5} step={0.1} />
          </Row>
          <Row label="Quiet Mode" sub="Suppresses low-priority alerts and signals">
            <Toggle value={store.quietMode} onChange={v => store.update({ quietMode: v })} color={A} />
          </Row>
          <Row label="Focus Timer (minutes)" sub="Pomodoro-style work interval for discipline">
            <NumberInput value={store.focusTimerMinutes} onChange={v => store.update({ focusTimerMinutes: v })} min={5} max={60} step={5} />
          </Row>
        </Section>

        {/* Sound & Notifications */}
        <Section icon={<Volume2 size={16} />} title="Sound & Notifications">
          <Row label="Sound Enabled" sub="Master switch for all audio alerts">
            <Toggle value={store.soundEnabled} onChange={v => store.update({ soundEnabled: v })} />
          </Row>
          <Row label="Sound on Alert Trigger" sub="Plays when a price alert fires">
            <Toggle value={cp.soundOnAlert} onChange={v => saveCp({ soundOnAlert: v })} />
          </Row>
          <Row label="Sound on Signal" sub="Plays when a new trade signal is detected">
            <Toggle value={cp.soundOnSignal} onChange={v => saveCp({ soundOnSignal: v })} />
          </Row>
          <Row label="In-App Notifications" sub="Shows notification banners inside the dashboard">
            <Toggle value={cp.inAppNotifications} onChange={v => saveCp({ inAppNotifications: v })} />
          </Row>
          <Row label="Desktop Notifications" sub="Browser push notifications (requires permission)">
            <Toggle value={cp.desktopNotifications} onChange={v => {
              if (v && typeof window !== 'undefined' && 'Notification' in window) {
                Notification.requestPermission();
              }
              saveCp({ desktopNotifications: v });
            }} />
          </Row>
          <Row label="Notifications Enabled" sub="Global notification toggle from base settings">
            <Toggle value={store.notificationsEnabled} onChange={v => store.update({ notificationsEnabled: v })} />
          </Row>
        </Section>

        {/* Trading Defaults */}
        <Section icon={<Shield size={16} />} title="Trading Defaults">
          <Row label="Default Trade Type">
            <SegmentedControl
              options={[{ label: 'Day', value: 'day' }, { label: 'Swing', value: 'swing' }, { label: 'Both', value: 'both' }]}
              value={store.defaultTradeType} onChange={v => store.update({ defaultTradeType: v as 'day' | 'swing' | 'both' })} />
          </Row>
          <Row label="Default Option Type">
            <SegmentedControl
              options={[{ label: 'Calls', value: 'calls' }, { label: 'Puts', value: 'puts' }, { label: 'Both', value: 'both' }]}
              value={store.defaultOptionType} onChange={v => store.update({ defaultOptionType: v as 'calls' | 'puts' | 'both' })} color={A} />
          </Row>
          <Row label="Max Option Premium ($)" sub="Upper bound for options contract filtering">
            <NumberInput value={store.defaultMaxPremium} onChange={v => store.update({ defaultMaxPremium: v })} min={10} step={10} prefix="$" />
          </Row>
          <Row label="Broker" sub="Your brokerage (for reference in trade plans)">
            <input type="text" value={store.brokerName} onChange={e => store.update({ brokerName: e.target.value })}
              className="rounded-lg px-3 py-1.5 text-sm outline-none w-36"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#f0f0f0' }} />
          </Row>
        </Section>

        {/* Watchlists */}
        <Section icon={<List size={16} />} title="Watchlist Management">
          <p className="text-xs" style={{ color: '#6b7280' }}>Comma-separated symbols. Used across scanner, dashboard, and intraday views.</p>
          <div className="space-y-3">
            {[
              { label: 'Watchlist A — Primary', key: 'watchlistA' as const, placeholder: 'SPY,QQQ,NVDA,TSLA…' },
              { label: 'Watchlist B — Alt/Speculative', key: 'watchlistB' as const, placeholder: 'PLTR,COIN,MSTR…' },
              { label: 'Watchlist C — Futures/Commodities', key: 'watchlistC' as const, placeholder: 'NQ=F,ES=F,GC=F…' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <div className="sec-label mb-1.5">{label}</div>
                <TextInput value={cp[key]} onChange={v => saveCp({ [key]: v })} placeholder={placeholder} />
                <div className="flex flex-wrap gap-1 mt-2">
                  {cp[key].split(',').filter(Boolean).map(sym => (
                    <span key={sym} className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold"
                      style={{ background: `${G}15`, color: G, border: `1px solid ${G}30` }}>
                      {sym.trim()}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Keyboard Shortcuts */}
        <Section icon={<Keyboard size={16} />} title="Keyboard Shortcuts">
          <p className="text-xs mb-2" style={{ color: '#6b7280' }}>Click a keybind and press any key to reassign. Press Escape to cancel.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'Toggle Focus Mode', key: 'focusMode' as const },
              { label: 'Refresh Data',      key: 'refresh'    as const },
              { label: 'Open Scanner',      key: 'scanner'    as const },
              { label: 'Go to Dashboard',   key: 'dashboard'  as const },
            ].map(({ label, key }) => (
              <div key={key} className="rounded-lg p-3 flex items-center justify-between"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ color: '#f0f0f0', fontSize: '13px' }}>{label}</span>
                <KeybindInput value={cp.hotkeys[key]} action={label}
                  onChange={v => saveCp({ hotkeys: { ...cp.hotkeys, [key]: v } })} />
              </div>
            ))}
          </div>
        </Section>

        {/* Display */}
        <Section icon={<Palette size={16} />} title="Display">
          <Row label="Show Disclaimer Banners" sub="Legal disclaimers on analysis pages">
            <Toggle value={store.showDisclaimer} onChange={v => store.update({ showDisclaimer: v })} color={A} />
          </Row>
          <Row label="Noise Suppression Default" sub="Auto-filter weak setups during midday / low volume">
            <Toggle value={false} onChange={() => {}} color={A} />
          </Row>
        </Section>

        {/* About */}
        <div className="rounded-xl p-5 text-xs space-y-1" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: '#374151' }}>
          <div className="font-semibold mb-2" style={{ color: '#6b7280' }}>About Tradevi</div>
          <p>Trader Operating System — built for disciplined, execution-focused traders.</p>
          <p>All data is for educational purposes only. Never risk more than you can afford to lose.</p>
          <p>Data sources: Alpaca Markets · Yahoo Finance · Finviz Elite · StockCharts</p>
        </div>
      </div>
    </AppShell>
  );
}

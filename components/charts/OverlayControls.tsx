'use client';

interface Overlays {
  showEMA9: boolean;
  showEMA20: boolean;
  showEMA50: boolean;
  showEMA200: boolean;
  showVWAP: boolean;
  showBollinger: boolean;
  showSuperTrend: boolean;
  showMACD: boolean;
  showRSI: boolean;
  showVolume: boolean;
}

interface Props {
  overlays: Overlays;
  onChange: (key: keyof Overlays, value: boolean) => void;
}

const BUTTONS: { key: keyof Overlays; label: string; color: string }[] = [
  { key: 'showEMA9',       label: 'EMA 9',        color: '#f0c040' },
  { key: 'showEMA20',      label: 'EMA 20',       color: '#4fc3f7' },
  { key: 'showEMA50',      label: 'EMA 50',       color: '#ffb74d' },
  { key: 'showEMA200',     label: 'EMA 200',      color: '#ce93d8' },
  { key: 'showVWAP',       label: 'VWAP',         color: '#00e676' },
  { key: 'showBollinger',  label: 'BB',           color: '#78909c' },
  { key: 'showSuperTrend', label: 'SuperTrend',   color: '#a0c4ff' },
  { key: 'showMACD',       label: 'MACD',         color: '#4fc3f7' },
  { key: 'showVolume',     label: 'Volume',       color: '#3a4060' },
];

export function OverlayControls({ overlays, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {BUTTONS.map(({ key, label, color }) => (
        <button
          key={key}
          onClick={() => onChange(key, !overlays[key])}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
            overlays[key]
              ? 'bg-[#1e2230] text-white border-[#3a4060]'
              : 'bg-transparent text-gray-500 border-[#2b3040] hover:border-[#3a4060]'
          }`}
        >
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: overlays[key] ? color : '#3a4060' }}
          />
          {label}
        </button>
      ))}
    </div>
  );
}

'use client';
import { useState } from 'react';
import { X, Settings, Info, Eye, EyeOff, RotateCcw } from 'lucide-react';
import type { IndicatorConfig, IndicatorType } from './chartTypes';
import { PRESETS } from './chartTypes';

interface Props {
  indicators: IndicatorConfig[];
  onChange: (updated: IndicatorConfig[]) => void;
  onClose: () => void;
  beginnerMode: boolean;
}

const SWATCHES = [
  '#f0c040','#4fc3f7','#ffb74d','#ce93d8','#00e676','#78909c','#a0c4ff',
  '#ffd54f','#ab47bc','#42a5f5','#ef5350','#546e7a','#ffa726','#26a69a',
];

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1 p-2 bg-white border border-gray-200 rounded-lg shadow-md z-50">
      {SWATCHES.map(s => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${
            value === s ? 'border-gray-800 scale-110' : 'border-transparent'
          }`}
          style={{ backgroundColor: s }}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-5 h-5 rounded cursor-pointer border-0 p-0 bg-transparent"
        title="Custom color"
      />
    </div>
  );
}

function IndicatorRow({
  config,
  onToggle,
  onColorChange,
  onPeriodChange,
  beginnerMode,
}: {
  config: IndicatorConfig;
  onToggle: () => void;
  onColorChange: (c: string) => void;
  onPeriodChange: (p: number) => void;
  beginnerMode: boolean;
}) {
  const [showColor, setShowColor] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className={`group flex items-center gap-2 py-2 px-2 rounded-lg transition-colors hover:bg-gray-50 ${!config.enabled ? 'opacity-60' : ''}`}>
      {/* Toggle */}
      <button onClick={onToggle} className="flex-shrink-0" aria-label={`Toggle ${config.label}`}>
        {config.enabled
          ? <div className="w-4 h-4 rounded bg-purple-600 flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
                <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          : <div className="w-4 h-4 rounded border-2 border-gray-300" />
        }
      </button>

      {/* Color dot */}
      <div className="relative flex-shrink-0">
        <button
          onClick={() => setShowColor(v => !v)}
          className="w-3.5 h-3.5 rounded-full border border-white/50 hover:scale-125 transition-transform"
          style={{ backgroundColor: config.color }}
          title="Change color"
        />
        {showColor && (
          <div className="absolute left-0 top-5 z-50">
            <ColorPicker value={config.color} onChange={c => { onColorChange(c); setShowColor(false); }} />
          </div>
        )}
      </div>

      {/* Label */}
      <span className="flex-1 text-sm text-gray-700 font-medium truncate">{config.label}</span>

      {/* Period input (where applicable) */}
      {config.period > 0 && (
        <input
          type="number"
          value={config.period}
          min={2}
          max={500}
          onChange={e => onPeriodChange(Number(e.target.value))}
          className="w-12 text-xs text-center border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-purple-300"
          title="Period"
        />
      )}

      {/* Info tooltip */}
      {beginnerMode && (
        <button
          onClick={() => setShowInfo(v => !v)}
          className="flex-shrink-0 text-gray-400 hover:text-blue-500 transition-colors"
          title="What does this indicator do?"
        >
          <Info size={13} />
        </button>
      )}

      {/* Info popup */}
      {showInfo && (
        <div className="absolute right-4 mt-1 z-50 max-w-xs p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 shadow-lg">
          <p className="font-semibold mb-1">{config.label}</p>
          <p>{config.description}</p>
          <button onClick={() => setShowInfo(false)} className="mt-1 text-blue-500 hover:underline">Close</button>
        </div>
      )}
    </div>
  );
}

export function IndicatorPanel({ indicators, onChange, onClose, beginnerMode }: Props) {
  const update = (id: IndicatorType, patch: Partial<IndicatorConfig>) =>
    onChange(indicators.map(ind => ind.id === id ? { ...ind, ...patch } : ind));

  const applyPreset = (presetName: string) => {
    const preset = PRESETS.find(p => p.name === presetName);
    if (!preset) return;
    onChange(indicators.map(ind => ({ ...ind, enabled: preset.enable.includes(ind.id) })));
  };

  const hideAll  = () => onChange(indicators.map(ind => ({ ...ind, enabled: false })));
  const showAll  = () => onChange(indicators.map(ind => ({ ...ind, enabled: true  })));

  const mainIndicators   = indicators.filter(i => i.panel === 'main');
  const panelIndicators  = indicators.filter(i => i.panel !== 'main');

  return (
    <div className="absolute right-0 top-0 h-full w-72 bg-white border-l border-gray-200 shadow-xl z-40 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="font-bold text-gray-900 text-sm">Indicators</h3>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
          <X size={16} />
        </button>
      </div>

      {/* Presets */}
      <div className="px-3 py-3 border-b border-gray-100">
        <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Presets</p>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(preset => (
            <button
              key={preset.name}
              onClick={() => applyPreset(preset.name)}
              title={preset.description}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-purple-100 hover:text-purple-700 transition-colors"
            >
              {preset.emoji} {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Indicator list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <p className="text-xs text-gray-400 px-2 mb-1 font-medium uppercase tracking-wide">Price Overlays</p>
        {mainIndicators.map(config => (
          <IndicatorRow
            key={config.id}
            config={config}
            onToggle={() => update(config.id, { enabled: !config.enabled })}
            onColorChange={c => update(config.id, { color: c })}
            onPeriodChange={p => update(config.id, { period: p })}
            beginnerMode={beginnerMode}
          />
        ))}

        <p className="text-xs text-gray-400 px-2 mt-3 mb-1 font-medium uppercase tracking-wide">Panels (shown below chart)</p>
        {panelIndicators.map(config => (
          <IndicatorRow
            key={config.id}
            config={config}
            onToggle={() => update(config.id, { enabled: !config.enabled })}
            onColorChange={c => update(config.id, { color: c })}
            onPeriodChange={p => update(config.id, { period: p })}
            beginnerMode={beginnerMode}
          />
        ))}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-gray-100 bg-gray-50">
        <button onClick={hideAll} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
          <EyeOff size={12} /> Hide all
        </button>
        <button onClick={showAll} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
          <Eye size={12} /> Show all
        </button>
        <button
          onClick={() => applyPreset('Trend')}
          className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800"
        >
          <RotateCcw size={12} /> Reset defaults
        </button>
      </div>
    </div>
  );
}

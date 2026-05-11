'use client';
import {
  RefreshCw, Maximize2, Minimize2, Sun, Moon, Grid3X3,
  TrendingUp, GraduationCap, Layers, ChevronDown
} from 'lucide-react';
import type { ChartTheme } from './chartTypes';

interface Props {
  theme: ChartTheme;
  onThemeToggle: () => void;
  onResetView: () => void;
  onRefresh: () => void;
  loading?: boolean;
  fullscreen: boolean;
  onFullscreenToggle: () => void;
  showGrid: boolean;
  onGridToggle: () => void;
  showRR: boolean;
  onRRToggle: () => void;
  beginnerMode: boolean;
  onBeginnerToggle: () => void;
  showIndicatorPanel: boolean;
  onIndicatorPanelToggle: () => void;
}

export function ChartToolbar({
  theme, onThemeToggle, onResetView, onRefresh, loading,
  fullscreen, onFullscreenToggle,
  showGrid, onGridToggle,
  showRR, onRRToggle,
  beginnerMode, onBeginnerToggle,
  showIndicatorPanel, onIndicatorPanelToggle,
}: Props) {
  const btn = (
    active: boolean,
    onClick: () => void,
    icon: React.ReactNode,
    tip: string,
    activeClass = 'bg-purple-100 text-purple-700'
  ) => (
    <button
      title={tip}
      onClick={onClick}
      className={`p-2 rounded-lg border text-sm transition-all ${
        active
          ? `${activeClass} border-purple-200`
          : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
      }`}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Indicators toggle */}
      <button
        onClick={onIndicatorPanelToggle}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
          showIndicatorPanel
            ? 'bg-purple-600 text-white border-purple-600'
            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
      >
        <Layers size={13} />
        Indicators
        <ChevronDown size={11} className={`transition-transform ${showIndicatorPanel ? 'rotate-180' : ''}`} />
      </button>

      {/* R/R Tool */}
      <button
        onClick={onRRToggle}
        title="Risk/Reward Tool — plan entry, stop-loss, and target"
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
          showRR
            ? 'bg-green-600 text-white border-green-600'
            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
      >
        <TrendingUp size={13} />
        R/R Tool
      </button>

      <div className="w-px h-5 bg-gray-200 mx-0.5" />

      {btn(false, onResetView, loading
        ? <span className="block w-3.5 h-3.5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
        : <RefreshCw size={14} />, 'Reset view / Refresh data')}

      {btn(showGrid, onGridToggle, <Grid3X3 size={14} />, 'Toggle grid lines')}

      {btn(beginnerMode, onBeginnerToggle, <GraduationCap size={14} />,
        beginnerMode ? 'Beginner mode ON — plain English labels' : 'Beginner mode — plain English labels',
        'bg-blue-100 text-blue-700')}

      {btn(false, onThemeToggle,
        theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />,
        theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme')}

      {btn(fullscreen, onFullscreenToggle,
        fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />,
        fullscreen ? 'Exit fullscreen' : 'Fullscreen chart')}
    </div>
  );
}

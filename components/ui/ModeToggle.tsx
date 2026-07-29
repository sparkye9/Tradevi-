'use client';
import { useTradeviStore, ExperienceMode } from '@/store/tradeviStore';

const MODES: { id: ExperienceMode; label: string }[] = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
];

// Always-visible, one control, no settings page to dig through — flipping
// this changes jargon and default-expanded panels everywhere at once.
export default function ModeToggle({ compact = false }: { compact?: boolean }) {
  const { experienceMode, setExperienceMode } = useTradeviStore();

  return (
    <div className={`flex rounded-lg overflow-hidden border border-[#2a2a2a] bg-[#0d0d0d] ${compact ? 'text-[10px]' : 'text-xs'}`}>
      {MODES.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => setExperienceMode(id)}
          className={`flex-1 font-semibold transition-all ${compact ? 'px-1.5 py-1' : 'px-2 py-1.5'} ${
            experienceMode === id
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'text-gray-600 hover:text-gray-300'
          }`}
          title={`Switch to ${label} mode`}
        >
          {compact ? label.slice(0, 3) : label}
        </button>
      ))}
    </div>
  );
}

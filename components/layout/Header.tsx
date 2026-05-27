'use client';
import { useState, useEffect } from 'react';
import { Menu, Bell, Settings } from 'lucide-react';
import Link from 'next/link';
import { useAlertsStore } from '@/store/alertsStore';

interface HeaderProps {
  onMenuClick: () => void;
  title: string;
}

function useMarketClock() {
  const [time, setTime]   = useState('');
  const [status, setStatus] = useState<'OPEN' | 'PRE' | 'AH' | 'CLOSED'>('CLOSED');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const et  = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const h = et.getHours(), m = et.getMinutes(), day = et.getDay();
      const mins = h * 60 + m;

      setTime(
        et.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      );

      if (day === 0 || day === 6) { setStatus('CLOSED'); return; }
      if (mins >= 570 && mins < 960)   { setStatus('OPEN');   return; }
      if (mins >= 240 && mins < 570)   { setStatus('PRE');    return; }
      if (mins >= 960 && mins < 1200)  { setStatus('AH');     return; }
      setStatus('CLOSED');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return { time, status };
}

const STATUS_STYLE: Record<string, { color: string; glow: string; label: string }> = {
  OPEN:   { color: '#00ff88', glow: '0 0 8px rgba(0,255,136,0.8)', label: 'OPEN'   },
  PRE:    { color: '#f59e0b', glow: '0 0 8px rgba(245,158,11,0.7)', label: 'PRE'   },
  AH:     { color: '#f59e0b', glow: '0 0 8px rgba(245,158,11,0.7)', label: 'AH'    },
  CLOSED: { color: '#374151', glow: 'none',                          label: 'CLOSED' },
};

export function Header({ onMenuClick, title }: HeaderProps) {
  const { time, status } = useMarketClock();
  const triggered = useAlertsStore(s => s.getTriggered());
  const st = STATUS_STYLE[status] ?? STATUS_STYLE.CLOSED;

  return (
    <header
      className="sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 shrink-0"
      style={{ background: '#111318', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-1.5 rounded transition-colors hover:bg-white/5"
          style={{ color: '#6b7280' }}
        >
          <Menu size={18} />
        </button>
        <h1
          className="font-semibold text-sm tracking-wide"
          style={{ color: '#f0f0f0' }}
        >
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-5">
        {/* Market status dot + label */}
        <div className="hidden sm:flex items-center gap-1.5">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: st.color, boxShadow: st.glow }}
          />
          <span
            className="text-xs font-mono font-bold tracking-wider"
            style={{ color: st.color, fontSize: '10px' }}
          >
            {st.label}
          </span>
        </div>

        {/* Clock */}
        <span
          className="hidden sm:block text-xs font-mono tabular-nums"
          style={{ color: '#6b7280', fontFamily: '"JetBrains Mono", monospace' }}
        >
          {time} ET
        </span>

        {/* Alerts bell */}
        <Link
          href="/alerts"
          className="relative p-1.5 rounded transition-colors hover:bg-white/5"
          style={{ color: '#6b7280' }}
        >
          <Bell size={15} />
          {triggered.length > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold"
              style={{
                background: '#ff3b3b',
                color: '#fff',
                fontSize: '9px',
                boxShadow: '0 0 6px rgba(255,59,59,0.7)',
              }}
            >
              {triggered.length}
            </span>
          )}
        </Link>

        {/* Settings */}
        <Link
          href="/settings"
          className="p-1.5 rounded transition-colors hover:bg-white/5"
          style={{ color: '#6b7280' }}
        >
          <Settings size={15} />
        </Link>
      </div>
    </header>
  );
}

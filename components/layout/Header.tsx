'use client';
import { useState, useEffect } from 'react';
import { Menu, Bell, Settings, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useAlertsStore } from '@/store/alertsStore';

interface HeaderProps {
  onMenuClick: () => void;
  title: string;
}

export function Header({ onMenuClick, title }: HeaderProps) {
  const [time, setTime] = useState('');
  const triggered = useAlertsStore(s => s.getTriggered());

  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-600"
        >
          <Menu size={20} />
        </button>
        <h1 className="font-semibold text-gray-900 text-base">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden sm:block text-xs text-gray-400 font-mono tabular-nums">{time}</span>

        <Link href="/alerts" className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-600">
          <Bell size={18} />
          {triggered.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center font-bold animate-pulse">
              {triggered.length}
            </span>
          )}
        </Link>

        <Link href="/risk" className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">
          <Settings size={18} />
        </Link>
      </div>
    </header>
  );
}

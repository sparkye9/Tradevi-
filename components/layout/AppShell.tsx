'use client';
import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MarketBanner } from './MarketBanner';

interface AppShellProps {
  children: React.ReactNode;
  title: string;
  fullWidth?: boolean;
}

export function AppShell({ children, title, fullWidth }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen" style={{ background: '#0d0f14' }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} title={title} />
        <MarketBanner />
        <main className="flex-1 overflow-y-auto scrollbar-cockpit">
          <div className={fullWidth ? 'p-4 lg:p-5' : 'max-w-screen-xl mx-auto p-4 lg:p-5'}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

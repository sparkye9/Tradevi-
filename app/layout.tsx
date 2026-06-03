import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/layout/Sidebar';
import FuturesBar from '@/components/ui/FuturesBar';
import BibleVerse from '@/components/ui/BibleVerse';

export const metadata: Metadata = {
  title: 'Tradevi 3.0',
  description: 'Trading dashboard. Discovers setups. Does not execute.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0f0f0f] text-white min-h-screen flex">
        {/* Sidebar — hidden on mobile, shown on md+ */}
        <div className="hidden md:block">
          <Sidebar />
        </div>
        <div className="flex-1 flex flex-col overflow-auto min-w-0">
          <FuturesBar />
          {/* pb-20 on mobile leaves room for bottom nav */}
          <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6">{children}</main>
          <div className="hidden md:block">
            <BibleVerse />
          </div>
        </div>
        {/* Bottom nav — shown on mobile only */}
        <Sidebar mobile />
      </body>
    </html>
  );
}

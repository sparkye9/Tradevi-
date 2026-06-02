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
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-auto">
          <FuturesBar />
          <main className="flex-1 p-6">{children}</main>
          <BibleVerse />
        </div>
      </body>
    </html>
  );
}

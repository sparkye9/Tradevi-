import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/layout/Sidebar';
import FuturesBar from '@/components/ui/FuturesBar';
import SessionStrip from '@/components/ui/SessionStrip';
import BibleVerse from '@/components/ui/BibleVerse';
import { DisclaimerBanner } from '@/components/ui/DisclaimerBanner';
import ChatFab from '@/components/ui/ChatFab';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Tradevi 3.0',
  description: 'Trading dashboard. Discovers setups. Does not execute.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="bg-[#0f0f0f] text-white min-h-screen flex font-sans">
        <div className="hidden md:block">
          <Sidebar />
        </div>
        <div className="flex-1 flex flex-col overflow-auto min-w-0">
          <DisclaimerBanner />
          <FuturesBar />
          <SessionStrip />
          <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6">{children}</main>
          <div className="hidden md:block">
            <BibleVerse />
          </div>
        </div>
        <Sidebar mobile />
        <ChatFab />
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/layout/Sidebar';
import FuturesBar from '@/components/ui/FuturesBar';
import SessionStrip from '@/components/ui/SessionStrip';
import BibleVerse from '@/components/ui/BibleVerse';
import { DisclaimerBanner } from '@/components/ui/DisclaimerBanner';
import MarketStatusBanner from '@/components/ui/MarketStatusBanner';

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
  title: 'Tradevi — learn to read the market',
  description:
    'A trading-education dashboard: Options 101, futures trend stacks, stock scans, option chains, power hour and an economic calendar. Education only.',
  openGraph: {
    title: 'Tradevi — learn to read the market',
    description: 'Learn how futures, stocks and options setups are judged. Education only.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="bg-tv-bg text-white min-h-screen flex font-sans">
        <div className="hidden md:block">
          <Sidebar />
        </div>
        <div className="flex-1 flex flex-col overflow-auto min-w-0">
          <DisclaimerBanner />
          <MarketStatusBanner />
          <FuturesBar />
          <SessionStrip />
          <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6">{children}</main>
          <div className="hidden md:block">
            <BibleVerse />
          </div>
        </div>
        <Sidebar mobile />
      </body>
    </html>
  );
}

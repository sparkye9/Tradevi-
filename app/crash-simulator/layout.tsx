import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Crash Simulator · Tradevi' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

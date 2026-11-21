import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Crash Intelligence · Tradevi' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

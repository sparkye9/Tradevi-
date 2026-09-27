'use client';
import { useEffect, useState, type ReactNode } from 'react';

/** Renders children only after mount — for time-dependent UI that can't match the server HTML. */
export default function ClientOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <>{mounted ? children : fallback}</>;
}

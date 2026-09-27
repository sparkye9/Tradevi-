'use client';
import Desk from '@/components/dashboard/Desk';
import ClientOnly from '@/components/ClientOnly';

function DeskSkeleton() {
  return (
    <div className="space-y-4 max-w-7xl">
      <div className="skeleton h-40 w-full rounded-2xl" />
      <div className="skeleton h-8 w-2/3 max-w-xl" />
      <div className="skeleton h-64 w-full rounded-2xl" />
    </div>
  );
}

export default function DashboardPage() {
  // The desk is driven by the live market clock, so render it in the browser only.
  return (
    <ClientOnly fallback={<DeskSkeleton />}>
      <Desk />
    </ClientOnly>
  );
}

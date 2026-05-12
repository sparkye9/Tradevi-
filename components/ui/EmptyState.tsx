import type { ReactNode } from 'react';

interface EmptyStateProps {
  message: string;
  children?: ReactNode;
}

export function EmptyState({ message, children }: EmptyStateProps) {
  return (
    <div className="p-8 text-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-gray-600">
      <p className="text-sm font-medium mb-2">{message}</p>
      {children}
    </div>
  );
}

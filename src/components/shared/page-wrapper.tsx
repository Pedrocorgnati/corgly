import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface PageWrapperProps {
  children: ReactNode;
  className?: string;
}

export function PageWrapper({ children, className }: PageWrapperProps) {
  return (
    <div className={cn('px-4 py-6 md:px-6 md:py-8 max-w-6xl mx-auto', className)}>
      {children}
    </div>
  );
}

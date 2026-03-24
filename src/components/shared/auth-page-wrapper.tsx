import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface AuthPageWrapperProps {
  children: ReactNode;
  className?: string;
}

export function AuthPageWrapper({ children, className }: AuthPageWrapperProps) {
  return (
    <div
      className={cn(
        'min-h-[calc(100vh-64px)] flex flex-col items-center justify-center py-8 px-4',
        className
      )}
    >
      {children}
    </div>
  );
}

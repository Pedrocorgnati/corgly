'use client';

import { cn } from '@/lib/utils';

const COLORS = [
  'bg-[#4F46E5] text-white',
  'bg-[#059669] text-white',
  'bg-[#D97706] text-white',
  'bg-[#0284C7] text-white',
  'bg-[#DC2626] text-white',
  'bg-[#6366F1] text-white',
  'bg-[#0891B2] text-white',
  'bg-[#7C3AED] text-white',
];

const SIZE_MAP = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getColorIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % COLORS.length;
}

interface AvatarInitialsProps {
  name: string;
  size?: keyof typeof SIZE_MAP;
  className?: string;
  src?: string;
}

export function AvatarInitials({ name, size = 'md', className, src }: AvatarInitialsProps) {
  const initials = getInitials(name || 'U');
  const color = COLORS[getColorIndex(name || '')];
  const sizeClass = SIZE_MAP[size];

  if (src) {
    return (
      <div className={cn('rounded-full overflow-hidden flex-shrink-0', sizeClass, className)}>
        {/* @ASSET_PLACEHOLDER
        name: user-avatar
        type: image
        extension: jpg
        description: Avatar do usuário. Foto de perfil circular.
        context: Header, sidebar, cards de sessão
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name} className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-full flex-shrink-0 flex items-center justify-center font-semibold select-none',
        sizeClass,
        color,
        className
      )}
      aria-label={name}
    >
      {initials}
    </div>
  );
}

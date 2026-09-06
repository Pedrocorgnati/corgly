import Image from 'next/image';
import { cn } from '@/lib/utils';

type BrandLogoProps = {
  variant?: 'dark' | 'light';
  showMark?: boolean;
  showWordmark?: boolean;
  priority?: boolean;
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
};

export function BrandLogo({
  variant = 'dark',
  showMark = true,
  showWordmark = true,
  priority = false,
  className,
  markClassName,
  wordmarkClassName,
}: BrandLogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      {showMark && (
        <Image
          src="/images/brand/corgi.png"
          alt=""
          width={36}
          height={34}
          className={cn('h-8 w-auto', markClassName)}
          priority={priority}
        />
      )}
      {showWordmark && (
        <span
          className={cn(
            'text-[1.35rem] font-semibold leading-none tracking-tight',
            variant === 'light' ? 'text-white' : 'text-[#1B2140]',
            wordmarkClassName,
          )}
        >
          Corgly
        </span>
      )}
    </span>
  );
}

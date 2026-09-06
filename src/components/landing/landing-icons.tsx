import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.45,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function IconCalendarClock(props: IconProps) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" {...props}>
      <rect x="10" y="14" width="32" height="32" rx="4" {...stroke} />
      <path d="M10 24h32M20 10v8M32 10v8" {...stroke} />
      <circle cx="44" cy="44" r="12" {...stroke} />
      <path d="M44 38v7l5 3" {...stroke} />
      <path d="M18 32h4M26 32h4M18 38h4" {...stroke} />
    </svg>
  );
}

export function IconLiveLesson(props: IconProps) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" {...props}>
      <rect x="10" y="14" width="44" height="30" rx="4" {...stroke} />
      <circle cx="32" cy="26" r="7" {...stroke} />
      <path d="M22 40c2.5-5 17.5-5 20 0" {...stroke} />
      <rect x="18" y="46" width="28" height="8" rx="4" {...stroke} />
    </svg>
  );
}

export function IconFeedbackDoc(props: IconProps) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" {...props}>
      <path d="M18 10h20l10 10v34H18z" {...stroke} />
      <path d="M38 10v10h10" {...stroke} />
      <path d="M26 28h16M26 36h16M26 44h8" {...stroke} />
      <circle cx="46" cy="46" r="10" {...stroke} />
      <path d="M41 46l3.5 3.5 7-7" {...stroke} />
    </svg>
  );
}

export function IconNextCycle(props: IconProps) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" {...props}>
      <circle cx="32" cy="32" r="22" {...stroke} />
      <path d="M18 42h8v-8M26 42c6-10 12-16 22-20" {...stroke} />
      <path d="M20 28h6v10M30 24h6v18M40 32h6v10" {...stroke} />
      <path d="M44 16l8 4-4 8" {...stroke} />
    </svg>
  );
}

export function IconShieldHeart(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" {...props}>
      <path d="M24 6l16 6v12c0 10-7 16-16 20C15 40 8 34 8 24V12z" {...stroke} />
      <path d="M24 32s-8-5-8-11a4.5 4.5 0 018-2 4.5 4.5 0 018 2c0 6-8 11-8 11z" {...stroke} />
    </svg>
  );
}

export function IconCycleArrows(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" {...props}>
      <path d="M34 16a12 12 0 00-20 4" {...stroke} />
      <path d="M14 12v8h8" {...stroke} />
      <path d="M14 32a12 12 0 0020-4" {...stroke} />
      <path d="M34 36v-8h-8" {...stroke} />
      <circle cx="24" cy="24" r="3" {...stroke} />
    </svg>
  );
}

export function IconChatPair(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" {...props}>
      <rect x="8" y="8" width="22" height="16" rx="6" {...stroke} />
      <rect x="18" y="22" width="22" height="16" rx="6" {...stroke} />
      <circle cx="15" cy="16" r="1.4" fill="currentColor" />
      <circle cx="19" cy="16" r="1.4" fill="currentColor" />
      <circle cx="23" cy="16" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function IconChatHeart(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" {...props}>
      <path d="M8 10h24a6 6 0 016 6v10a6 6 0 01-6 6H20l-8 8v-8H8a6 6 0 01-6-6V16a6 6 0 016-6z" {...stroke} />
      <path d="M34 30c4 0 8 3.2 8 7.2 0 4.6-8 9.8-8 9.8s-8-5.2-8-9.8c0-4 4-7.2 8-7.2z" {...stroke} />
    </svg>
  );
}

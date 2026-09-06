import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LanguageFlags } from '@/components/landing/language-flags';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt as string} src={props.src as string} />
  ),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en-US',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button type="button" {...props}>{children}</button>
  ),
}));

vi.mock('@/hooks/useLandingLocale', () => ({
  useLandingLocale: () => ({ locale: 'en-US', setLocale: vi.fn() }),
}));

describe('LanguageFlags', () => {
  it('exposes flag testids', () => {
    render(<LanguageFlags />);
    expect(screen.getByTestId('language-flags')).toBeInTheDocument();
    expect(screen.getByTestId('flag-en-US')).toBeInTheDocument();
    expect(screen.getByTestId('flag-pt-BR')).toBeInTheDocument();
    expect(screen.getByTestId('flag-es-ES')).toBeInTheDocument();
    expect(screen.getByTestId('flag-it-IT')).toBeInTheDocument();
  });
});

import type { PropsWithChildren, ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({
  getDashboardUser: vi.fn(),
  getDashboardCredits: vi.fn(),
  getDashboardNextSession: vi.fn(),
  getDashboardProgress: vi.fn(),
  getDashboardRecentFeedbacks: vi.fn(),
}));

vi.mock('@/actions/dashboard', () => actions);

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl/server', () => ({
  getLocale: vi.fn(async () => 'pt-BR'),
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key),
}));

vi.mock('@/components/student/credit-widget', () => ({
  CreditWidget: () => <div data-testid="credit-widget" />,
}));

vi.mock('@/components/student/next-session-card', () => ({
  NextSessionCard: ({ session }: { session: Record<string, unknown> | null }) => (
    <div
      data-testid="next-session-card-props"
      data-start-at={String(session?.startAt ?? '')}
      data-date={String(session?.date ?? '')}
      data-time={String(session?.time ?? '')}
    />
  ),
}));

vi.mock('@/components/student/quick-stats', () => ({
  QuickStats: () => <div data-testid="quick-stats" />,
}));

vi.mock('@/components/dashboard/CorglyCircle', () => ({
  CorglyCircle: () => <div data-testid="corgly-circle" />,
}));

vi.mock('@/components/dashboard/RecentFeedbackList', () => ({
  RecentFeedbackList: () => <div data-testid="recent-feedbacks" />,
}));

vi.mock('@/components/ui/widget-error-boundary', () => ({
  WidgetErrorBoundary: ({ children }: PropsWithChildren) => <>{children}</>,
}));

vi.mock('@/components/student/checkout-success-toast', () => ({
  CheckoutSuccessToast: () => null,
}));

vi.mock('@/components/student/session-error-toast', () => ({
  SessionErrorToast: () => null,
}));

vi.mock('@/components/shared', () => ({
  PageWrapper: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => (
    <main {...props}>{children}</main>
  ),
  DashboardPageHeader: ({ chips, actions: headerActions }: {
    chips?: ReactNode;
    actions?: ReactNode;
  }) => (
    <header>
      {chips}
      {headerActions}
    </header>
  ),
  DashboardHeaderChip: ({ children }: PropsWithChildren) => <span>{children}</span>,
  WidgetCard: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => (
    <section {...props}>{children}</section>
  ),
}));

import DashboardPage from '@/app/(student)/dashboard/page';

describe('DashboardPage: proxima aula', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T12:00:00.000Z'));

    actions.getDashboardUser.mockResolvedValue({ data: { name: 'Ana' }, error: null });
    actions.getDashboardCredits.mockResolvedValue({
      data: { balance: 2, breakdown: [] },
      error: null,
    });
    actions.getDashboardNextSession.mockResolvedValue({
      data: {
        session: {
          id: 'session-1',
          startAt: '2026-09-11T17:00:00.000Z',
          endAt: '2026-09-11T17:55:00.000Z',
          status: 'SCHEDULED',
        },
      },
      error: null,
    });
    actions.getDashboardProgress.mockResolvedValue({
      data: {
        totalSessions: 1,
        completedSessions: 1,
        averageScores: { listening: 0, speaking: 0, writing: 0, vocabulary: 0 },
      },
      error: null,
    });
    actions.getDashboardRecentFeedbacks.mockResolvedValue({ data: { items: [] }, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('propaga startAt e formata data e hora validas para o card', async () => {
    render(await DashboardPage());

    const card = screen.getByTestId('next-session-card-props');
    expect(card).toHaveAttribute('data-start-at', '2026-09-11T17:00:00.000Z');
    expect(card.getAttribute('data-date')).not.toMatch(/Invalid|NaN/i);
    expect(card.getAttribute('data-time')).not.toMatch(/Invalid|NaN/i);
    expect(card.getAttribute('data-date')).not.toBe('');
    expect(card.getAttribute('data-time')).not.toBe('');
  });
});

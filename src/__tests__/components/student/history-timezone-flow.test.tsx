import { fireEvent, render, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  getCanonicalTimezone: vi.fn(),
  getSessions: vi.fn(),
  redirect: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@/lib/data/auth', () => ({
  getAuthUser: mocks.getAuthUser,
}));

vi.mock('@/lib/canonical-timezone', () => ({
  getCanonicalTimezone: mocks.getCanonicalTimezone,
}));

vi.mock('@/actions/sessions', () => ({
  getSessions: mocks.getSessions,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/components/shared', () => ({
  PageWrapper: ({ children, ...props }: PropsWithChildren<{ 'data-testid'?: string }>) => (
    <main {...props}>{children}</main>
  ),
}));

vi.mock('@/components/session/DocumentSearch', () => ({
  DocumentSearch: () => <div data-testid="document-search" />,
}));

vi.mock('@/components/calendar/RescheduleFlow', () => ({
  RescheduleFlow: ({
    open,
    studentTimezone,
    adminTimezone,
  }: {
    open: boolean;
    studentTimezone: string;
    adminTimezone: string;
  }) => open ? (
    <div
      data-testid="reschedule-flow"
      data-student-timezone={studentTimezone}
      data-admin-timezone={adminTimezone}
    />
  ) : null,
}));

import HistoryPage from '@/app/(student)/history/page';

describe('HistoryPage - fuso persistido do aluno', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthUser.mockResolvedValue({
      id: 'student-1',
      name: 'Aluna',
      email: 'student@example.test',
      role: 'STUDENT',
      creditBalance: 1,
      emailConfirmed: true,
      timezone: 'America/Sao_Paulo',
    });
    mocks.getCanonicalTimezone.mockResolvedValue('Europe/Rome');
    mocks.getSessions.mockResolvedValue({
      data: [{
        id: 'session-1',
        startAt: '2026-09-11T00:00:00.000Z',
        endAt: '2026-09-11T01:00:00.000Z',
        status: 'SCHEDULED',
        adminName: 'Professor',
      }],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
  });

  it('formata o histórico e abre a remarcação com o mesmo User.timezone', async () => {
    render(<>{await HistoryPage({ searchParams: Promise.resolve({}) })}</>);

    expect(screen.getByTestId('session-card-session-1')).toHaveTextContent('21:00');
    fireEvent.click(screen.getByTestId('session-card-session-1-reschedule-button'));
    expect(screen.getByTestId('reschedule-flow')).toHaveAttribute(
      'data-student-timezone',
      'America/Sao_Paulo',
    );
    expect(screen.getByTestId('reschedule-flow')).toHaveAttribute(
      'data-admin-timezone',
      'Europe/Rome',
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

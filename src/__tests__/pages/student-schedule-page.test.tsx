import { render, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  getCanonicalTimezone: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/lib/data/auth', () => ({
  getAuthUser: mocks.getAuthUser,
}));

vi.mock('@/lib/canonical-timezone', () => ({
  getCanonicalTimezone: mocks.getCanonicalTimezone,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () =>
    (key: string, values?: { timezone?: string }) =>
      key === 'timezone' ? `Fuso: ${values?.timezone}` : key,
  ),
}));

vi.mock('@/components/shared', () => ({
  PageWrapper: ({ children, ...props }: PropsWithChildren<{ 'data-testid'?: string }>) => (
    <main {...props}>{children}</main>
  ),
}));

vi.mock('@/components/student/calendar-schedule', () => ({
  CalendarSchedule: ({
    creditBalance,
    studentTimezone,
    adminTimezone,
  }: {
    creditBalance: number;
    studentTimezone: string;
    adminTimezone: string;
  }) => (
    <div
      data-testid="calendar-schedule-props"
      data-credit-balance={creditBalance}
      data-student-timezone={studentTimezone}
      data-admin-timezone={adminTimezone}
    />
  ),
}));

import SchedulePage from '@/app/(student)/schedule/page';

describe('SchedulePage - fuso persistido do aluno', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthUser.mockResolvedValue({
      id: 'student-1',
      name: 'Aluna',
      email: 'student@example.test',
      role: 'STUDENT',
      creditBalance: 2,
      emailConfirmed: true,
      timezone: 'America/Sao_Paulo',
    });
    mocks.getCanonicalTimezone.mockResolvedValue('Europe/Rome');
  });

  it('usa User.timezone no cabeçalho e entrega o mesmo valor ao calendário', async () => {
    render(<>{await SchedulePage()}</>);

    expect(screen.getByTestId('schedule-header')).toHaveTextContent(
      'Fuso: America/Sao_Paulo',
    );
    expect(screen.getByTestId('calendar-schedule-props')).toHaveAttribute(
      'data-student-timezone',
      'America/Sao_Paulo',
    );
    expect(screen.getByTestId('calendar-schedule-props')).toHaveAttribute(
      'data-credit-balance',
      '2',
    );
    expect(screen.getByTestId('calendar-schedule-props')).toHaveAttribute(
      'data-admin-timezone',
      'Europe/Rome',
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

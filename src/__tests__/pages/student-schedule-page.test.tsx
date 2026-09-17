import { render, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  getCanonicalTimezone: vi.fn(),
  redirect: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/data/auth', () => ({
  getAuthUser: mocks.getAuthUser,
}));

// GAP-028 (D1): a regressao da guarda de /api/v1/admin/settings mora neste
// arquivo. Mockar o guard corta o unico caminho que chega ao Prisma; `@/lib/auth`
// fica real, porque `apiResponse` e a funcao que a rota usa na resposta 200.
vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: mocks.requireAdmin,
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

import { NextRequest, NextResponse } from 'next/server';

import SchedulePage from '@/app/(student)/schedule/page';
import { GET } from '@/app/api/v1/admin/settings/route';

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

describe('GET /api/v1/admin/settings: guarda administrativa (GAP-028 ST005.4)', () => {
  const pedido = () => new NextRequest('http://localhost/api/v1/admin/settings');

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCanonicalTimezone.mockResolvedValue('Europe/Rome');
  });

  it('devolve o 403 do guard para aluno sem ler o fuso canonico', async () => {
    mocks.requireAdmin.mockResolvedValue(
      NextResponse.json({ data: null, error: 'Acesso restrito a administradores.' }, { status: 403 }),
    );

    const res = await GET(pedido());

    expect(res.status).toBe(403);
    expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.getCanonicalTimezone).not.toHaveBeenCalled();
  });

  it('devolve o 401 do guard sem sessao sem ler o fuso canonico', async () => {
    mocks.requireAdmin.mockResolvedValue(
      NextResponse.json({ data: null, error: 'Não autorizado.' }, { status: 401 }),
    );

    const res = await GET(pedido());

    expect(res.status).toBe(401);
    expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.getCanonicalTimezone).not.toHaveBeenCalled();
  });

  it('entrega o fuso canonico ao admin numa unica leitura', async () => {
    mocks.requireAdmin.mockResolvedValue({ id: 'admin-1', role: 'ADMIN', tokenVersion: 0 });

    const res = await GET(pedido());

    expect(res.status).toBe(200);
    expect((await res.json()).data.timezone).toBe('Europe/Rome');
    expect(mocks.getCanonicalTimezone).toHaveBeenCalledTimes(1);
  });
});

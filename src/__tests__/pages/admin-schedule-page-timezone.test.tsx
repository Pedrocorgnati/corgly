/**
 * GAP-08 - a pagina da agenda do professor le o fuso canonico no servidor e o
 * entrega ao `AdminScheduleClient`.
 *
 * A pagina montava `<AdminScheduleClient />` sem fuso: o painel do professor
 * abria no mes do relogio do navegador e agrupava por dia UTC.
 */
import { render, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCanonicalTimezone: vi.fn(),
}));

vi.mock('@/lib/canonical-timezone', () => ({
  getCanonicalTimezone: mocks.getCanonicalTimezone,
}));

vi.mock('@/components/shared', () => ({
  PageWrapper: ({ children, ...props }: PropsWithChildren<{ 'data-testid'?: string }>) => (
    <main {...props}>{children}</main>
  ),
}));

vi.mock('@/app/(admin)/admin/schedule/schedule-client', () => ({
  AdminScheduleClient: ({ adminTimezone }: { adminTimezone?: string }) => (
    <div data-testid="probe-admin-schedule-client" data-timezone={adminTimezone ?? 'ausente'} />
  ),
}));

import AdminSchedulePage from '@/app/(admin)/admin/schedule/page';

describe('AdminSchedulePage - fuso canonico do professor (GAP-08)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCanonicalTimezone.mockResolvedValue('Pacific/Kiritimati');
  });

  it('RED: P1 entrega o fuso canonico ao AdminScheduleClient', async () => {
    render(<>{await AdminSchedulePage()}</>);

    expect(screen.getByTestId('probe-admin-schedule-client')).toHaveAttribute(
      'data-timezone',
      'Pacific/Kiritimati',
    );
    expect(mocks.getCanonicalTimezone).toHaveBeenCalledTimes(1);
  });

  it('CONTROLE: P2 a pagina continua no PageWrapper da agenda', async () => {
    render(<>{await AdminSchedulePage()}</>);

    expect(screen.getByTestId('page-admin-schedule')).toBeInTheDocument();
  });
});

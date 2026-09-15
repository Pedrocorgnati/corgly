import type { Metadata } from 'next';
import { AdminScheduleClient } from './schedule-client';
import { PageWrapper } from '@/components/shared';
import { getCanonicalTimezone } from '@/lib/canonical-timezone';

export const metadata: Metadata = {
  title: 'Admin — Agenda',
};

export default async function AdminSchedulePage() {
  // Fuso canonico do professor, lido no servidor (GAP-08): mes civil, dia e horario da agenda.
  const adminTimezone = await getCanonicalTimezone();
  return (
    <PageWrapper data-testid="page-admin-schedule">
      <AdminScheduleClient adminTimezone={adminTimezone} />
    </PageWrapper>
  );
}

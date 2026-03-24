import type { Metadata } from 'next';
import { AdminScheduleClient } from './schedule-client';
import { PageWrapper } from '@/components/shared';

export const metadata: Metadata = {
  title: 'Admin — Agenda',
};

export default function AdminSchedulePage() {
  return (
    <PageWrapper>
      <AdminScheduleClient />
    </PageWrapper>
  );
}

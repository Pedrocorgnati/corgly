'use client';

import { useRouter } from 'next/navigation';
import { SessionList } from '@/components/session/SessionList';

interface SessionRow {
  id: string;
  studentName: string;
  startAt: string;
  endAt: string;
  status: string;
  score?: number | null;
}

interface PaginatedSessions {
  data: SessionRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface AdminSessionsClientProps {
  sessions: PaginatedSessions;
  currentPage: number;
  currentStatus: string | null;
}

export function AdminSessionsClient({
  sessions,
  currentPage,
  currentStatus,
}: AdminSessionsClientProps) {
  const router = useRouter();

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams();
    if (currentStatus) params.set('status', currentStatus);
    params.set('page', String(page));
    router.push(`/admin/sessions?${params.toString()}`);
  };

  const handleStatusFilter = (status: string | null) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    params.set('page', '1');
    router.push(`/admin/sessions?${params.toString()}`);
  };

  const handleSessionClick = (id: string) => {
    router.push(`/admin/sessions/${id}`);
  };

  return (
    <SessionList
      sessions={sessions}
      onPageChange={handlePageChange}
      onStatusFilter={handleStatusFilter}
      currentStatusFilter={currentStatus}
      isLoading={false}
      onSessionClick={handleSessionClick}
    />
  );
}

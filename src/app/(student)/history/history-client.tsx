'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { History } from 'lucide-react';
import { SessionCard } from '@/components/ui/session-card';
import { CancelConfirmDialog } from '@/components/calendar/CancelConfirmDialog';
import { RescheduleFlow } from '@/components/calendar/RescheduleFlow';
import { RescheduleRequestBadge } from '@/components/calendar/RescheduleRequestBadge';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { SessionStatus, SESSION_STATUS_MAP } from '@/lib/constants/enums';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface SessionData {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  studentName?: string;
  adminName?: string;
  score?: number | null;
}

interface PaginatedData {
  data: SessionData[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface HistoryClientProps {
  sessions: PaginatedData;
  currentPage: number;
  currentStatus: string | null;
}

const FILTER_STATUSES = [
  SessionStatus.SCHEDULED,
  SessionStatus.COMPLETED,
  SessionStatus.CANCELLED_BY_STUDENT,
  SessionStatus.CANCELLED_BY_ADMIN,
  SessionStatus.RESCHEDULE_PENDING,
] as const;

export function HistoryClient({
  sessions,
  currentPage,
  currentStatus,
}: HistoryClientProps) {
  const router = useRouter();
  const [cancelSession, setCancelSession] = useState<SessionData | null>(null);
  const [rescheduleSession, setRescheduleSession] = useState<SessionData | null>(null);

  const handleStatusFilter = (status: string | null) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    params.set('page', '1');
    router.push(`/history?${params.toString()}`);
  };

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams();
    if (currentStatus) params.set('status', currentStatus);
    params.set('page', String(page));
    router.push(`/history?${params.toString()}`);
  };

  const handleCancelled = () => {
    setCancelSession(null);
    router.refresh();
  };

  const handleRescheduled = () => {
    setRescheduleSession(null);
    router.refresh();
  };

  const data = (sessions?.data ?? []) as SessionData[];
  const totalPages = sessions?.totalPages ?? 0;

  return (
    <>
      {/* Status filters */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        <button
          onClick={() => handleStatusFilter(null)}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs border transition-colors',
            !currentStatus
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border text-muted-foreground hover:border-primary',
          )}
        >
          Todas
        </button>
        {FILTER_STATUSES.map((status) => {
          const config = SESSION_STATUS_MAP[status];
          return (
            <button
              key={status}
              onClick={() => handleStatusFilter(status)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs border transition-colors',
                currentStatus === status
                  ? `${config.bg} ${config.color} border-current`
                  : 'border-border text-muted-foreground hover:border-primary',
              )}
            >
              {config.label}
            </button>
          );
        })}
      </div>

      {/* Sessions list */}
      {data.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nenhuma aula no histórico"
          description="Após concluir sua primeira aula, ela aparecerá aqui com o feedback da sessão."
          actionLabel="Agendar primeira aula"
          actionHref="/schedule"
        />
      ) : (
        <div className="space-y-3">
          {data.map((session) => (
            <div key={session.id}>
              <RescheduleRequestBadge status={session.status} />
              <SessionCard
                session={session}
                onCancel={
                  session.status === SessionStatus.SCHEDULED
                    ? () => setCancelSession(session)
                    : undefined
                }
                onReschedule={
                  session.status === SessionStatus.SCHEDULED
                    ? () => setRescheduleSession(session)
                    : undefined
                }
              />
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-xs text-muted-foreground">
            Página {currentPage} de {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-foreground">{currentPage}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      {cancelSession && (
        <CancelConfirmDialog
          session={cancelSession}
          open={!!cancelSession}
          onOpenChange={(open) => !open && setCancelSession(null)}
          onCancelled={handleCancelled}
        />
      )}

      {rescheduleSession && (
        <RescheduleFlow
          session={rescheduleSession}
          open={!!rescheduleSession}
          onOpenChange={(open) => !open && setRescheduleSession(null)}
          onRescheduled={handleRescheduled}
        />
      )}
    </>
  );
}

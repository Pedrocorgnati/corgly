'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SessionStatus, SESSION_STATUS_MAP } from '@/lib/constants/enums';
import { cn } from '@/lib/utils';

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

interface SessionListProps {
  sessions: PaginatedSessions;
  onPageChange: (page: number) => void;
  onStatusFilter: (status: string | null) => void;
  currentStatusFilter: string | null;
  isLoading: boolean;
  onSessionClick?: (id: string) => void;
}

const ALL_STATUSES = Object.values(SessionStatus);

export function SessionList({
  sessions,
  onPageChange,
  onStatusFilter,
  currentStatusFilter,
  isLoading,
  onSessionClick,
}: SessionListProps) {
  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 animate-pulse">
        <div className="h-5 w-32 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
      {/* Filters */}
      <div className="p-4 border-b border-border flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-foreground mr-2">Filtrar:</span>
        <button
          onClick={() => onStatusFilter(null)}
          className={cn(
            'px-3 py-1 rounded-full text-xs border transition-colors',
            !currentStatusFilter
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border text-muted-foreground hover:border-primary',
          )}
        >
          Todos
        </button>
        {ALL_STATUSES.map((status) => {
          const config = SESSION_STATUS_MAP[status];
          return (
            <button
              key={status}
              onClick={() => onStatusFilter(status)}
              className={cn(
                'px-3 py-1 rounded-full text-xs border transition-colors',
                currentStatusFilter === status
                  ? `${config.bg} ${config.color} border-current`
                  : 'border-border text-muted-foreground hover:border-primary',
              )}
            >
              {config.label}
            </button>
          );
        })}
      </div>

      {/* Table */}
      {sessions.data.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <p className="text-sm">Nenhuma sessão encontrada.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Aluno</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data/Hora</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Score</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {sessions.data.map((session) => {
                const config = SESSION_STATUS_MAP[session.status as SessionStatus] ?? {
                  label: session.status,
                  color: 'text-muted-foreground',
                  bg: 'bg-muted',
                };

                return (
                  <tr key={session.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 text-foreground">{session.studentName}</td>
                    <td className="px-4 py-3 text-foreground">
                      {new Date(session.startAt).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                      })}{' '}
                      {new Date(session.startAt).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                          config.color,
                          config.bg,
                        )}
                      >
                        {config.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {session.score != null ? `${session.score}/5` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSessionClick?.(session.id)}
                      >
                        Ver
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {sessions.totalPages > 1 && (
        <div className="flex items-center justify-between p-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Página {sessions.page} de {sessions.totalPages} ({sessions.total} sessões)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(sessions.page - 1)}
              disabled={sessions.page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-foreground">{sessions.page}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(sessions.page + 1)}
              disabled={sessions.page >= sessions.totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

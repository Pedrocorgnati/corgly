import type { Metadata } from 'next';
import { Calendar } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = {
  title: 'Admin — Sessões',
};

// TODO: Implementar backend — GET /api/v1/admin/sessions
const MOCK_SESSIONS: Array<{
  id: string;
  studentName: string;
  date: string;
  time: string;
  status: string;
  score: number | null;
}> = [];

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  SCHEDULED: { label: 'Agendada', className: 'text-primary border-primary/20 bg-primary/5' },
  IN_PROGRESS: { label: 'Em andamento', className: 'text-[#059669] border-green-200 bg-green-50' },
  COMPLETED: { label: 'Concluída', className: 'text-muted-foreground border-border' },
  CANCELLED: { label: 'Cancelada', className: 'text-destructive border-destructive/20 bg-destructive/5' },
};

export default function AdminSessionsPage() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Sessões</h1>
        <p className="text-sm text-muted-foreground mt-1">Todas as aulas da plataforma</p>
      </div>

      {MOCK_SESSIONS.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="Nenhuma sessão ainda"
          description="As sessões agendadas pelos alunos aparecerão aqui."
        />
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Aluno</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Data e hora</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Score</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_SESSIONS.map((session) => {
                  const statusInfo = STATUS_LABEL[session.status] ?? STATUS_LABEL.SCHEDULED;
                  return (
                    <tr key={session.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{session.studentName}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-foreground">{session.date}</p>
                        <p className="text-xs text-muted-foreground">{session.time}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={statusInfo.className}>
                          {statusInfo.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {session.score != null ? `${session.score.toFixed(1)}/5` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

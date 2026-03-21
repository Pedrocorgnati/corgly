import type { Metadata } from 'next';
import { History, Star } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = {
  title: 'Histórico de Aulas',
};

// TODO: Implementar backend — GET /api/v1/sessions/history
const MOCK_SESSIONS: Array<{
  id: string;
  date: string;
  time: string;
  status: string;
  score: number | null;
}> = [];

export default function HistoryPage() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <History className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Histórico de Aulas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Todas as suas sessões anteriores</p>
        </div>
      </div>

      {MOCK_SESSIONS.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nenhuma aula no histórico"
          description="Após concluir sua primeira aula, ela aparecerá aqui com o feedback da sessão."
          actionLabel="Agendar primeira aula"
          actionHref="/schedule"
        />
      ) : (
        <div className="space-y-3">
          {MOCK_SESSIONS.map((session) => (
            <div key={session.id} className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">{session.date}</p>
                <p className="text-sm text-muted-foreground">{session.time}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={
                  session.status === 'COMPLETED' ? 'text-[#059669] border-green-200 bg-green-50' :
                  session.status === 'CANCELLED' ? 'text-muted-foreground border-border' :
                  'text-primary border-primary/20 bg-primary/5'
                }>
                  {session.status === 'COMPLETED' ? 'Concluída' :
                   session.status === 'CANCELLED' ? 'Cancelada' : 'Agendada'}
                </Badge>
                {session.score !== null && (
                  <span className="flex items-center gap-1 text-sm font-medium text-[#D97706]">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    {session.score.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

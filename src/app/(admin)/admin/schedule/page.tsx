import type { Metadata } from 'next';
import { Calendar, Plus } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Admin — Agenda',
};

// TODO: Implementar backend — GET /api/v1/admin/schedule/slots
export default function AdminSchedulePage() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agenda</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie seus horários disponíveis</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Novo horário
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6 shadow-sm">
          <EmptyState
            icon={Calendar}
            title="Nenhum slot configurado"
            description="Configure seus horários disponíveis para que os alunos possam agendar aulas."
          />
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold text-foreground mb-4">Próximas aulas</h3>
          <EmptyState
            icon={Calendar}
            title="Nenhuma aula"
            description="Suas próximas aulas agendadas aparecerão aqui."
          />
        </div>
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import { BookOpen, Plus } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Admin — Conteúdo',
};

// TODO: Implementar backend — GET /api/v1/admin/content
export default function AdminContentPage() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Conteúdo</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie materiais e exercícios</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Novo conteúdo
        </Button>
      </div>

      <EmptyState
        icon={BookOpen}
        title="Nenhum conteúdo criado"
        description="Crie materiais de estudo, exercícios e recursos para os seus alunos."
        actionLabel="Criar primeiro conteúdo"
      />
    </div>
  );
}

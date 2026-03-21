import type { Metadata } from 'next';
import { Users, Search } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = {
  title: 'Admin — Alunos',
};

// TODO: Implementar backend — GET /api/v1/admin/students
const MOCK_STUDENTS: Array<{
  id: string;
  name: string;
  email: string;
  credits: number;
  totalSessions: number;
  lastSession: string | null;
}> = [];

export default function AdminStudentsPage() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-6xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Alunos</h1>
          <p className="text-sm text-muted-foreground mt-1">{MOCK_STUDENTS.length} aluno(s) cadastrado(s)</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar aluno..." className="pl-9" />
        </div>
      </div>

      {MOCK_STUDENTS.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum aluno ainda"
          description="Os alunos cadastrados na plataforma aparecerão aqui."
        />
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Aluno</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Créditos</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Sessões</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Última aula</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_STUDENTS.map((student) => (
                  <tr key={student.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-sm text-foreground">{student.name}</p>
                        <p className="text-xs text-muted-foreground">{student.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{student.credits}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{student.totalSessions}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{student.lastSession ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={
                        student.credits > 0
                          ? 'text-[#059669] border-green-200 bg-green-50'
                          : 'text-muted-foreground border-border'
                      }>
                        {student.credits > 0 ? 'Ativo' : 'Sem créditos'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, StickyNote, AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { PageWrapper } from '@/components/shared';
import { getStudentNotes } from '@/actions/admin-support';
import { ROUTES } from '@/lib/constants/routes';
import { formatDateTimePtBR } from '@/lib/format-datetime';
import { AddInternalNoteForm } from '@/components/admin/support/AddInternalNoteForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin — Notas internas do aluno',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function StudentNotesPage({ params }: PageProps) {
  const { id } = await params;
  const { payload, error } = await getStudentNotes(id);

  if (error && !payload) {
    // 404 vindo do backend: aluno inexistente -> notFound; demais erros -> banner.
    if (error.toLowerCase().includes('não encontrado')) {
      notFound();
    }
    return (
      <PageWrapper data-testid="page-admin-student-notes">
        <div data-testid="admin-student-notes-error" className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Não foi possível carregar as notas.</p>
            <p className="text-destructive/80">{error}</p>
          </div>
        </div>
      </PageWrapper>
    );
  }

  if (!payload) {
    notFound();
  }

  const { student, notes, openTickets } = payload;

  return (
    <PageWrapper data-testid="page-admin-student-notes">
      <nav className="mb-4 flex items-center gap-1 text-sm text-muted-foreground" aria-label="Trilha">
        <Link href={ROUTES.ADMIN_STUDENTS} className="hover:text-foreground hover:underline">
          Alunos
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link
          href={`${ROUTES.ADMIN_STUDENTS}/${student.id}`}
          className="hover:text-foreground hover:underline"
        >
          {student.name}
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">Notas internas</span>
      </nav>

      <div data-testid="admin-student-notes-header" className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Notas internas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {student.name} · {student.email}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Histórico de notas ({notes.length})
          </h2>
          {notes.length === 0 ? (
            <EmptyState
              data-testid="admin-student-notes-empty"
              icon={StickyNote}
              title="Nenhuma nota interna"
              description="Registre a primeira anotação operacional sobre este aluno."
            />
          ) : (
            <ul data-testid="admin-student-notes-list" className="space-y-3">
              {notes.map((note) => (
                <li
                  key={note.id}
                  data-testid={`admin-student-notes-card-${note.id}`}
                  className="rounded-2xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Link
                      href={`${ROUTES.ADMIN_SUPPORT}?search=${encodeURIComponent(student.email)}`}
                      className="inline-flex items-center"
                    >
                      <Badge variant="outline" className="text-muted-foreground">
                        {note.ticketSubject}
                      </Badge>
                    </Link>
                    <time className="text-xs text-muted-foreground">
                      {formatDateTimePtBR(note.createdAt)}
                    </time>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{note.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside data-testid="admin-student-notes-form" className="lg:col-span-1">
          <AddInternalNoteForm studentId={student.id} openTickets={openTickets} />
        </aside>
      </div>
    </PageWrapper>
  );
}

import type { Metadata } from 'next';
import { PAGINATION } from '@/lib/constants';
import Link from 'next/link';
import { Suspense } from 'react';
import { Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { StudentSearchInput } from '@/components/admin/StudentSearchInput';
import { getAdminStudents } from '@/actions/admin-students';
import { ROUTES } from '@/lib/constants/routes';
import { formatDatePtBR } from '@/lib/format-datetime';
import { PageWrapper } from '@/components/shared';

export const metadata: Metadata = {
  title: 'Admin — Alunos',
};

interface Props {
  searchParams: Promise<{ search?: string; page?: string }>;
}

async function StudentsTable({ searchParams }: Props) {
  const params = await searchParams;
  const search = params.search ?? '';
  const page = Math.max(1, Number(params.page) || 1);

  const { data, error } = await getAdminStudents({
    search: search || undefined,
    page,
    limit: PAGINATION.ADMIN_STUDENTS,
  });

  if (error) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm text-center">
        <p className="text-sm text-destructive">Erro ao carregar alunos: {error}</p>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={search ? 'Nenhum aluno encontrado' : 'Nenhum aluno ainda'}
        description={
          search
            ? `Nenhum resultado para "${search}". Tente outro termo.`
            : 'Os alunos cadastrados na plataforma aparecerão aqui.'
        }
      />
    );
  }

  const totalPages = Math.ceil(data.total / data.limit);

  return (
    <>
      <p className="text-sm text-muted-foreground mb-4">
        {data.total} aluno(s) cadastrado(s)
      </p>

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  Aluno
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">
                  Créditos
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">
                  Último login
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((student) => (
                <tr
                  key={student.id}
                  className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`${ROUTES.ADMIN_STUDENTS}/${student.id}`}
                      className="block group"
                    >
                      <p className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                        {student.name}
                      </p>
                      <p className="text-xs text-muted-foreground">{student.email}</p>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground hidden sm:table-cell">
                    {student.creditBalance}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">
                    {formatDatePtBR(student.lastLoginAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={
                        student.isActive
                          ? 'text-success border-green-200 bg-green-50'
                          : 'text-muted-foreground border-border'
                      }
                    >
                      {student.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-muted-foreground">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`${ROUTES.ADMIN_STUDENTS}?${new URLSearchParams({
                  ...(search ? { search } : {}),
                  page: String(page - 1),
                }).toString()}`}
                className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`${ROUTES.ADMIN_STUDENTS}?${new URLSearchParams({
                  ...(search ? { search } : {}),
                  page: String(page + 1),
                }).toString()}`}
                className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Próxima
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default async function AdminStudentsPage(props: Props) {
  return (
    <PageWrapper>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Alunos</h1>
        <Suspense fallback={<div className="h-10 w-64 bg-muted rounded-lg animate-pulse" />}>
          <StudentSearchInput />
        </Suspense>
      </div>

      <Suspense
        fallback={
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm animate-pulse">
            <div className="h-4 bg-muted rounded w-1/4 mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted rounded" />
              ))}
            </div>
          </div>
        }
      >
        <StudentsTable searchParams={props.searchParams} />
      </Suspense>
    </PageWrapper>
  );
}

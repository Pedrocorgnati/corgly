/**
 * Skeleton do segmento de exercicios.
 *
 * Espelha a geometria de page.tsx (breadcrumb, cabecalho, um card com quatro
 * alternativas) para a troca de estado nao empurrar o layout. Sem texto de
 * proposito: skeleton nao passa por i18n, igual aos irmaos em (student).
 */

export default function ExercisesLoading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse px-4 py-6 md:px-6 md:py-8">
      {/* Breadcrumb */}
      <div className="mb-4 h-4 w-40 rounded bg-muted" />

      {/* Cabecalho */}
      <div className="mb-6 flex items-center gap-3">
        <div className="h-6 w-6 rounded bg-muted" />
        <div>
          <div className="h-7 w-40 rounded bg-muted" />
          <div className="mt-2 h-4 w-64 rounded bg-muted" />
        </div>
      </div>

      {/* Card do exercicio */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
        <div className="mb-5 border-b border-border pb-4">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-6 w-24 rounded-full bg-muted" />
            ))}
          </div>
          <div className="mt-3 h-6 w-72 rounded bg-muted" />
          <div className="mt-2 h-4 w-56 rounded bg-muted" />
        </div>

        <div className="mb-4">
          <div className="h-3 w-28 rounded bg-muted" />
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted" />
        </div>

        <div className="h-5 w-full max-w-lg rounded bg-muted" />

        <div className="mt-4 space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-border p-3.5">
              <div className="h-6 w-6 shrink-0 rounded-full bg-muted" />
              <div className="h-4 w-full rounded bg-muted" />
            </div>
          ))}
        </div>

        <div className="mt-5 flex gap-2 border-t border-border pt-4">
          <div className="h-9 w-40 rounded-lg bg-muted" />
          <div className="h-9 w-40 rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  );
}

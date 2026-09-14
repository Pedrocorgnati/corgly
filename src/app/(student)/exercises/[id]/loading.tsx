/**
 * Skeleton da tentativa de exercicio.
 *
 * Espelha a geometria do DrillShell (tres faixas: header com fechar/titulo/
 * progresso, corpo com enunciado e quatro alternativas, footer com botoes),
 * NAO a da lista. Sem texto de proposito: skeleton nao passa por i18n, igual
 * aos irmaos em (student).
 */

export default function ExerciseAttemptLoading() {
  return (
    <div className="flex min-h-dvh animate-pulse flex-col bg-background">
      {/* Header: fechar + titulo + progresso */}
      <div className="border-b border-border">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
          <div className="h-8 w-8 rounded-lg bg-muted" />
          <div className="h-4 w-48 rounded bg-muted" />
        </div>
        <div className="mx-auto w-full max-w-2xl px-4 pb-3">
          <div className="h-3 w-28 rounded bg-muted" />
          <div className="mt-1.5 h-1 w-full rounded-full bg-muted" />
        </div>
      </div>

      {/* Corpo: enunciado + alternativas */}
      <div className="flex-1">
        <div className="mx-auto w-full max-w-2xl px-4 py-6">
          <div className="h-5 w-full max-w-lg rounded bg-muted" />
          <div className="mt-4 space-y-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-border p-3.5">
                <div className="h-6 w-6 shrink-0 rounded-full bg-muted" />
                <div className="h-4 w-full rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer: botoes */}
      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-2xl gap-2 px-4 py-4">
          <div className="h-9 w-40 rounded-lg bg-muted" />
          <div className="h-9 w-40 rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  );
}

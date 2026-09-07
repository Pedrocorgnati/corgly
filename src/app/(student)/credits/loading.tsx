/**
 * Estado de carregamento da rota `/credits`.
 *
 * O esqueleto tem a forma do que vai chegar: cabecalho, faixa de saldo e a
 * grade de TRES planos da vitrine. O esqueleto anterior desenhava dois cartoes
 * de KPI que esta pagina nunca renderizou — prometia uma tela e entregava
 * outra, fazendo o conteudo "pular" na troca.
 */
export default function StudentCreditsLoading() {
  return (
    <div
      data-testid="credits-loading"
      className="px-4 py-6 md:px-6 md:py-8 max-w-6xl mx-auto animate-pulse"
    >
      <div className="mb-6">
        <div className="h-7 w-48 bg-muted rounded mb-2" />
        <div className="h-4 w-64 bg-muted rounded" />
      </div>

      {/* Faixa de saldo */}
      <div className="mb-6 h-[72px] bg-card border border-border rounded-2xl" />

      {/* Vitrine: tres planos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="h-80 bg-card border border-border rounded-2xl" />
        <div className="h-80 bg-card border-2 border-primary/40 rounded-2xl" />
        <div className="h-80 bg-card border border-border rounded-2xl" />
      </div>
    </div>
  );
}

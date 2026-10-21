export function EbookSummary({ items, title }: { items: readonly string[]; title: string }) {
  // Estado vazio explicito: a pagina nunca monta sumario sem itens.
  if (items.length === 0) return null;

  return (
    <section data-testid="ebook-summary" aria-labelledby="ebook-summary-title">
      <h2 id="ebook-summary-title" className="text-2xl font-semibold text-foreground">
        {title}
      </h2>
      <ul className="mt-4 flex list-disc flex-col gap-2 pl-5 text-base text-muted-foreground">
        {items.map((item, index) => (
          // Itens sao strings sem id; a ordem do catalogo e estavel.
          <li key={index}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

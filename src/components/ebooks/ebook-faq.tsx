export function EbookFaq({
  items,
  title,
}: {
  items: readonly { question: string; answer: string }[];
  title: string;
}) {
  // Estado vazio explicito: sem itens nao ha FAQ para exibir.
  if (items.length === 0) return null;

  return (
    <section data-testid="ebook-faq" aria-labelledby="ebook-faq-title">
      <h2 id="ebook-faq-title" className="text-2xl font-semibold text-foreground">
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-3">
        {items.map((item, index) => (
          // details/summary nativo: abre e fecha sem JS; ids estaveis por indice.
          <details
            key={index}
            data-testid={`ebook-faq-item-${index}`}
            open={index === 0}
            className="rounded-2xl border border-border bg-card px-4"
          >
            <summary
              data-testid={`ebook-faq-item-${index}-trigger`}
              className="cursor-pointer py-4 text-base font-medium text-foreground"
            >
              {item.question}
            </summary>
            <p className="pb-4 text-base text-muted-foreground">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

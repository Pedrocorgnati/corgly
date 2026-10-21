export function EbookGuarantee({ text }: { text?: string }) {
  // Sem texto de garantia nada e anunciado.
  if (!text) return null;

  return (
    <section data-testid="ebook-guarantee" className="rounded-2xl border border-border bg-card p-6">
      <p className="text-base text-muted-foreground">{text}</p>
    </section>
  );
}

export function EbookAiNotice({ text }: { text?: string }) {
  // Sem aviso a secao nao aparece.
  if (!text) return null;

  return (
    <aside data-testid="ebook-ai-notice" className="rounded-2xl border border-border bg-card p-6">
      <p className="text-base text-muted-foreground">{text}</p>
    </aside>
  );
}

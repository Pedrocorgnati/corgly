/**
 * Renderizador minimo de markdown para o `bodyMarkdown` versionado vindo de
 * `LegalDoc` (legal.service.getActiveLegalDoc). O projeto nao depende de nenhuma
 * biblioteca de markdown, entao tratamos o subconjunto que os documentos legais
 * usam: headings (#, ##, ###), listas (- ) e paragrafos separados por linha em
 * branco. Conteudo e texto puro (escapado pelo React), nunca HTML cru, evitando
 * superficie de XSS em pagina publica.
 */

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; text: string };

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const chunks = markdown.replace(/\r\n/g, '\n').split(/\n{2,}/);

  for (const rawChunk of chunks) {
    const chunk = rawChunk.trim();
    if (!chunk) continue;

    const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
    const isList = lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line));

    if (isList) {
      blocks.push({
        kind: 'list',
        items: lines.map((line) => line.replace(/^[-*]\s+/, '')),
      });
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(lines[0]);
    if (headingMatch && lines.length === 1) {
      blocks.push({
        kind: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    blocks.push({ kind: 'paragraph', text: lines.join(' ') });
  }

  return blocks;
}

interface LegalDocBodyProps {
  content: string;
}

export function LegalDocBody({ content }: LegalDocBodyProps) {
  const blocks = parseBlocks(content);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6 text-foreground">
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          if (block.level === 1) {
            return (
              <h2 key={index} className="text-2xl font-semibold mb-2">
                {block.text}
              </h2>
            );
          }
          if (block.level === 2) {
            return (
              <h3 key={index} className="text-xl font-semibold mb-2">
                {block.text}
              </h3>
            );
          }
          return (
            <h4 key={index} className="text-lg font-semibold mb-2">
              {block.text}
            </h4>
          );
        }

        if (block.kind === 'list') {
          return (
            <ul key={index} className="list-disc pl-5 space-y-1 text-muted-foreground">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="leading-relaxed">
                  {item}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={index} className="text-muted-foreground leading-relaxed">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

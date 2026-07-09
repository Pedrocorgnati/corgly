import 'server-only';

/**
 * Renderizacao segura de preview de email templates (T-054 / ST004).
 *
 * O preview interpola APENAS as variaveis declaradas na allowlist do template
 * (campo `variables` do EmailTemplate). Variaveis fora da allowlist nunca sao
 * interpoladas e sao reportadas como `unknownVariables`. O valor de cada
 * variavel e escapado para HTML antes da substituicao, e o resultado final e
 * re-validado contra o mesmo padrao de HTML inseguro usado na entrada, de modo
 * que o preview nunca executa script, handler inline, iframe ou URL executavel.
 */

const unsafeHtmlPattern =
  /<\s*script\b|javascript\s*:|data\s*:\s*text\/html|on[a-z]+\s*=|<\s*(iframe|object|embed|form|input|button|meta|link)\b/i;

const placeholderPattern = /\{\{\s*([a-zA-Z][a-zA-Z0-9_.-]{0,63})\s*\}\}/g;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface RenderPreviewResult {
  /** HTML renderizado e seguro (variaveis permitidas interpoladas, escapadas). */
  html: string;
  /** Variaveis da allowlist que foram efetivamente substituidas. */
  usedVariables: string[];
  /** Placeholders presentes no corpo que NAO estao na allowlist (nao interpolados). */
  unknownVariables: string[];
  /** true quando o resultado passou na checagem de HTML inseguro. */
  safe: boolean;
}

/**
 * Renderiza o preview de um template.
 *
 * @param htmlBody    Corpo HTML do template (ja validado na escrita).
 * @param allowed     Allowlist de variaveis declaradas pelo template.
 * @param values      Valores de exemplo por variavel (apenas allowlist e usada).
 */
export function renderTemplatePreview(
  htmlBody: string,
  allowed: readonly string[],
  values: Record<string, string> = {},
): RenderPreviewResult {
  const allowSet = new Set(allowed);
  const used = new Set<string>();
  const unknown = new Set<string>();

  const html = htmlBody.replace(placeholderPattern, (match, rawName: string) => {
    const name = rawName.trim();
    if (!allowSet.has(name)) {
      unknown.add(name);
      return match; // fora da allowlist: nao interpola, preserva literal
    }
    used.add(name);
    const raw = values[name];
    const safeValue =
      typeof raw === 'string' && raw.length > 0 ? raw : `[${name}]`;
    return escapeHtml(safeValue);
  });

  const safe = !unsafeHtmlPattern.test(html);

  return {
    html: safe ? html : '',
    usedVariables: Array.from(used),
    unknownVariables: Array.from(unknown),
    safe,
  };
}

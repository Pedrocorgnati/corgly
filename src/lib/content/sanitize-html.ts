// RESOLVED: Tiptap sanitization antes de persistir (intake-review G2)
// Server-side allowlist sanitizer para HTML vindo do ContentEditor (Tiptap StarterKit + Link).
// Minimalista e sem dependencias externas: filtra tags/atributos, normaliza hrefs e
// escapa conteudo textual suspeito. NAO substitui DOMPurify no cliente — e uma ultima
// linha de defesa contra payload injetado via API direta (bypass do editor).

const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'strong', 'em', 's', 'u', 'code', 'pre',
  'blockquote',
  'a',
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'rel', 'target']),
};

const SAFE_URL_SCHEMES = /^(https?:|mailto:|#|\/)/i;

function sanitizeAttrs(tag: string, attrsRaw: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed) return '';

  const out: string[] = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(attrsRaw)) !== null) {
    const name = match[1].toLowerCase();
    if (!allowed.has(name)) continue;

    let value = match[3] ?? match[4] ?? match[5] ?? '';
    value = value.replace(/[\r\n\t]/g, '').trim();

    if (name === 'href') {
      if (!SAFE_URL_SCHEMES.test(value)) continue;
    }
    if (name === 'target') {
      if (value !== '_blank') continue;
      out.push('target="_blank"', 'rel="noopener noreferrer nofollow"');
      continue;
    }
    if (name === 'rel') {
      continue;
    }

    out.push(`${name}="${value.replace(/"/g, '&quot;')}"`);
  }

  if (tag === 'a' && !out.some((a) => a.startsWith('rel=')) && out.some((a) => a.startsWith('target='))) {
    out.push('rel="noopener noreferrer nofollow"');
  }

  return out.length ? ' ' + out.join(' ') : '';
}

export function sanitizeTiptapHtml(input: string): string {
  if (!input) return '';
  let html = String(input);

  // 1. Strip comentarios, CDATA, DOCTYPE, processing instructions
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  html = html.replace(/<![\s\S]*?>/g, '');
  html = html.replace(/<\?[\s\S]*?\?>/g, '');

  // 2. Remove blocos perigosos (script/style/iframe/object/embed/link/meta/svg/math) inteiros
  html = html.replace(
    /<\s*(script|style|iframe|object|embed|link|meta|svg|math|form|button|input|textarea|select|option|base|frame|frameset|noscript|noframes|applet)\b[\s\S]*?<\s*\/\s*\1\s*>/gi,
    ''
  );
  html = html.replace(
    /<\s*(script|style|iframe|object|embed|link|meta|svg|math|form|input|base|img|frame|noscript|applet)\b[^>]*\/?\s*>/gi,
    ''
  );

  // 3. Walk tags: keep allowlisted, strip others (preservando conteudo textual).
  html = html.replace(/<\s*\/?\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_full, rawTag: string, attrs: string) => {
    const tag = rawTag.toLowerCase();
    const isClose = _full.trim().startsWith('</') || /^<\s*\//.test(_full);
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (isClose) return `</${tag}>`;
    const selfClosing = tag === 'br' || tag === 'hr';
    return `<${tag}${sanitizeAttrs(tag, attrs)}${selfClosing ? ' />' : ''}>`;
  });

  // 4. Kill qualquer javascript: / data: remanescente em texto
  html = html.replace(/javascript\s*:/gi, '');
  html = html.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  return html.trim();
}

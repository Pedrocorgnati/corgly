import 'server-only';

import type { EbookCatalogEntry } from './schema';

// Render puro dos emails de ebook: catalogo + kind + links ja montados pelo
// chamador viram subject/html/text. Sem I/O, sem env e sem montagem de URL;
// todo texto do catalogo passa por escape de HTML na versao html e link obrigatorio ausente,
// vazio ou fora de http(s) lanca TypeError.

export type EbookEmailKind = 'delivery' | 'async_failed' | 'refund_full' | 'refund_partial' | 'recovery';

export interface EbookEmailLinks {
  accessUrl?: string;
  withdrawalUrl?: string;
  retryUrl?: string;
}

export interface RenderedEbookEmail {
  subject: string;
  html: string;
  text: string;
}

export interface RenderEbookEmailParams {
  entry: Pick<EbookCatalogEntry, 'locale' | 'title' | 'copy'>;
  kind: EbookEmailKind;
  links: EbookEmailLinks;
}

type LinkName = keyof EbookEmailLinks;

interface EmailLink {
  label: string;
  url: string;
  button: boolean;
}

interface EmailPlan {
  subject: string;
  body: string;
  primary: EmailLink | undefined;
  waiver: string | undefined;
  withdrawal: EmailLink | undefined;
}

const BRAND = 'Corgly';

/**
 * Render puro do email transacional. `links` ja vem montado pelo chamador (o
 * mecanismo nao monta URL); os campos usados dependem do `kind`; todo texto do
 * catalogo sai escapado no html (o text/plain sai cru). Link obrigatorio ausente, vazio ou fora de http(s)
 * lanca `TypeError`.
 */
export function renderEbookEmail({
  entry,
  kind,
  links,
}: RenderEbookEmailParams): RenderedEbookEmail {
  const plan = buildPlan(entry, kind, links);

  return {
    subject: plan.subject,
    html: renderHtml(entry, plan),
    text: renderText(entry, plan),
  };
}

function buildPlan(
  entry: Pick<EbookCatalogEntry, 'copy'>,
  kind: EbookEmailKind,
  links: EbookEmailLinks,
): EmailPlan {
  const plan = planForKind(entry, kind, links);
  return { ...plan, subject: plan.subject.trim() };
}

function planForKind(
  entry: Pick<EbookCatalogEntry, 'copy'>,
  kind: EbookEmailKind,
  links: EbookEmailLinks,
): EmailPlan {
  const emails = entry.copy.emails;

  switch (kind) {
    case 'delivery':
      return {
        subject: emails.deliverySubject,
        body: emails.deliveryBody,
        primary: {
          label: emails.accessLinkLabel,
          url: requireHttpLink(links, 'accessUrl', kind),
          button: true,
        },
        waiver: emails.waiverNotice,
        withdrawal: {
          label: emails.withdrawalLinkLabel,
          url: requireHttpLink(links, 'withdrawalUrl', kind),
          button: false,
        },
      };

    case 'async_failed':
      return {
        subject: emails.asyncFailedSubject,
        body: emails.asyncFailedBody,
        primary: {
          label: emails.retryLinkLabel,
          url: requireHttpLink(links, 'retryUrl', kind),
          button: false,
        },
        waiver: undefined,
        withdrawal: undefined,
      };

    case 'recovery':
      return {
        subject: emails.recoverySubject,
        body: emails.recoveryBody,
        primary: {
          label: emails.accessLinkLabel,
          url: requireHttpLink(links, 'accessUrl', kind),
          button: true,
        },
        waiver: emails.waiverNotice,
        withdrawal: {
          label: emails.withdrawalLinkLabel,
          url: requireHttpLink(links, 'withdrawalUrl', kind),
          button: false,
        },
      };

    case 'refund_full':
      return {
        subject: emails.refundFullSubject,
        body: emails.refundFullBody,
        primary: undefined,
        waiver: undefined,
        withdrawal: undefined,
      };

    case 'refund_partial':
      return {
        subject: emails.refundPartialSubject,
        body: emails.refundPartialBody,
        primary: undefined,
        waiver: undefined,
        withdrawal: undefined,
      };

    default: {
      const inesperado: never = kind;
      throw new TypeError(`renderEbookEmail: kind desconhecido ${String(inesperado)}`);
    }
  }
}

function requireHttpLink(
  links: EbookEmailLinks,
  name: LinkName,
  kind: EbookEmailKind,
): string {
  const value = links[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`renderEbookEmail: links.${name} obrigatorio para kind ${kind}`);
  }

  const url = value.trim();
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    throw new TypeError(
      `renderEbookEmail: links.${name} deve comecar com http:// ou https:// para kind ${kind}`,
    );
  }

  return url;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

function renderParagraphHtml(paragraph: string): string {
  return `<p style="margin: 0 0 16px 0; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.5; color: #27272a;">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`;
}

function renderAnchor(link: EmailLink): string {
  const style = link.button
    ? 'display: inline-block; padding: 12px 20px; background-color: #18181b; color: #ffffff; font-size: 16px; text-decoration: none; border-radius: 6px;'
    : 'font-size: 14px; color: #18181b; text-decoration: underline;';

  return `<a href="${escapeHtml(link.url)}" style="${style}">${escapeHtml(link.label)}</a>`;
}

function renderHtml(entry: Pick<EbookCatalogEntry, 'locale' | 'title'>, plan: EmailPlan): string {
  const paragraphs = splitParagraphs(plan.body);
  const rows: string[] = [
    `<tr><td style="padding: 24px 24px 8px 24px; background-color: #ffffff; font-family: Arial, Helvetica, sans-serif;"><p style="margin: 0 0 4px 0; font-size: 12px; letter-spacing: 1px; color: #71717a;">${BRAND}</p><h1 style="margin: 0; font-size: 22px; line-height: 1.3; color: #18181b;">${escapeHtml(entry.title)}</h1></td></tr>`,
  ];

  if (paragraphs.length > 0) {
    rows.push(
      `<tr><td style="padding: 8px 24px 8px 24px; background-color: #ffffff;">${paragraphs.map(renderParagraphHtml).join('')}</td></tr>`,
    );
  }

  if (plan.primary) {
    rows.push(
      `<tr><td style="padding: 8px 24px 16px 24px; background-color: #ffffff;">${renderAnchor(plan.primary)}</td></tr>`,
    );
  }

  if (plan.waiver) {
    rows.push(
      `<tr><td style="padding: 8px 24px 8px 24px; background-color: #ffffff;"><p style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.5; color: #52525b;">${escapeHtml(plan.waiver).replace(/\n/g, '<br>')}</p></td></tr>`,
    );
  }

  if (plan.withdrawal) {
    rows.push(
      `<tr><td style="padding: 8px 24px 24px 24px; background-color: #ffffff;">${renderAnchor(plan.withdrawal)}</td></tr>`,
    );
  }

  return [
    '<!doctype html>',
    `<html lang="${escapeHtml(entry.locale)}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(plan.subject)}</title>`,
    '</head>',
    '<body style="margin: 0; padding: 0; background-color: #f4f4f5;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px; margin: 0 auto; border-collapse: collapse; background-color: #ffffff;">',
    rows.join('\n'),
    '</table>',
    '</body>',
    '</html>',
  ].join('\n');
}

function renderText(entry: Pick<EbookCatalogEntry, 'title'>, plan: EmailPlan): string {
  // text/plain nao interpreta HTML: o escape fica so na versao html.
  const blocks: string[] = [`${BRAND}\n${entry.title}`, ...splitParagraphs(plan.body)];

  if (plan.primary) {
    blocks.push(`${plan.primary.label}: ${plan.primary.url}`);
  }

  if (plan.waiver) {
    blocks.push(plan.waiver);
  }

  if (plan.withdrawal) {
    blocks.push(`${plan.withdrawal.label}: ${plan.withdrawal.url}`);
  }

  return blocks.join('\n\n');
}

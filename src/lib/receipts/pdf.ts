import 'server-only';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * @module lib/receipts/pdf
 *
 * Geracao de recibos PDF para pagamentos (TASK-13 / CL-264).
 *
 * Usa `pdf-lib` (zero dependencia nativa, funciona em runtime Node.js do Next).
 * Template simples A4 com:
 *   - Cabecalho com dados do vendedor (empresa) — env-configuraveis
 *   - Numero do recibo + data
 *   - Dados do comprador (usuario)
 *   - Descricao + valor total (moeda localizada)
 *   - Rodape com id da transacao
 *
 * Dados fiscais sao configuraveis via env (ver `receiptCompany()`).
 *
 * I18n: recebe `locale` (4 idiomas suportados: pt-BR, it-IT, en, es-ES) e mapeia
 * labels via `LABELS`.
 */

type SupportedLocale = 'pt-BR' | 'it-IT' | 'en' | 'es-ES';

const LABELS: Record<SupportedLocale, Record<string, string>> = {
  'pt-BR': {
    receipt: 'RECIBO',
    receiptNumber: 'Recibo nº',
    date: 'Data',
    seller: 'Vendedor',
    buyer: 'Comprador',
    description: 'Descrição',
    total: 'Total',
    status: 'Status',
    transactionId: 'ID da transação',
    taxId: 'CPF/CNPJ',
    address: 'Endereço',
    issuedBy: 'Emitido por',
  },
  'it-IT': {
    receipt: 'RICEVUTA',
    receiptNumber: 'Ricevuta n.',
    date: 'Data',
    seller: 'Venditore',
    buyer: 'Acquirente',
    description: 'Descrizione',
    total: 'Totale',
    status: 'Stato',
    transactionId: 'ID transazione',
    taxId: 'P.IVA',
    address: 'Indirizzo',
    issuedBy: 'Emesso da',
  },
  en: {
    receipt: 'RECEIPT',
    receiptNumber: 'Receipt #',
    date: 'Date',
    seller: 'Seller',
    buyer: 'Buyer',
    description: 'Description',
    total: 'Total',
    status: 'Status',
    transactionId: 'Transaction ID',
    taxId: 'Tax ID',
    address: 'Address',
    issuedBy: 'Issued by',
  },
  'es-ES': {
    receipt: 'RECIBO',
    receiptNumber: 'Recibo nº',
    date: 'Fecha',
    seller: 'Vendedor',
    buyer: 'Comprador',
    description: 'Descripción',
    total: 'Total',
    status: 'Estado',
    transactionId: 'ID de transacción',
    taxId: 'CIF/NIF',
    address: 'Dirección',
    issuedBy: 'Emitido por',
  },
};

export interface ReceiptCompany {
  name: string;
  taxId: string;
  address: string;
  email?: string;
}

export interface ReceiptBuyer {
  name: string;
  email: string;
  taxId?: string;
}

export interface ReceiptPayment {
  id: string;
  receiptNumber: string;
  createdAt: Date;
  description: string;
  amount: number; // centavos
  currency: string;
  status: string;
  transactionId: string;
}

export interface ReceiptInput {
  company: ReceiptCompany;
  buyer: ReceiptBuyer;
  payment: ReceiptPayment;
  locale?: SupportedLocale;
}

/**
 * Le dados fiscais da empresa via env (ver .env / .env.example).
 *
 * Envs (todas opcionais — defaults seguros para dev):
 *   RECEIPT_COMPANY_NAME
 *   RECEIPT_COMPANY_TAX_ID
 *   RECEIPT_COMPANY_ADDRESS
 *   RECEIPT_COMPANY_EMAIL
 */
export function receiptCompany(): ReceiptCompany {
  return {
    name: process.env.RECEIPT_COMPANY_NAME || 'Corgly',
    taxId: process.env.RECEIPT_COMPANY_TAX_ID || '—',
    address: process.env.RECEIPT_COMPANY_ADDRESS || '—',
    email: process.env.RECEIPT_COMPANY_EMAIL,
  };
}

function formatAmount(amountCents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase() === 'USDC' ? 'USD' : currency.toUpperCase(),
    }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function formatDate(d: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' }).format(d);
  } catch {
    return d.toISOString();
  }
}

/**
 * Gera o PDF do recibo e retorna como `Uint8Array`.
 */
export async function generateReceiptPdf(input: ReceiptInput): Promise<Uint8Array> {
  const locale: SupportedLocale = input.locale ?? 'en';
  const labels = LABELS[locale];

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`${labels.receipt} ${input.payment.receiptNumber}`);
  pdfDoc.setAuthor(input.company.name);
  pdfDoc.setSubject(labels.receipt);
  pdfDoc.setCreator('Corgly — billing/receipts');
  pdfDoc.setCreationDate(new Date());

  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const marginX = 50;
  let y = height - 60;

  // Header
  page.drawText(labels.receipt, {
    x: marginX,
    y,
    size: 22,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText(`${labels.receiptNumber} ${input.payment.receiptNumber}`, {
    x: width - marginX - 220,
    y,
    size: 11,
    font,
    color: rgb(0.25, 0.25, 0.25),
  });
  y -= 18;
  page.drawText(`${labels.date}: ${formatDate(input.payment.createdAt, locale)}`, {
    x: width - marginX - 220,
    y,
    size: 10,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });

  // Divider
  y -= 20;
  page.drawLine({
    start: { x: marginX, y },
    end: { x: width - marginX, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });

  // Seller block
  y -= 28;
  page.drawText(labels.seller, { x: marginX, y, size: 11, font: fontBold });
  y -= 14;
  page.drawText(input.company.name, { x: marginX, y, size: 10, font });
  y -= 12;
  page.drawText(`${labels.taxId}: ${input.company.taxId}`, { x: marginX, y, size: 10, font });
  y -= 12;
  page.drawText(`${labels.address}: ${input.company.address}`, { x: marginX, y, size: 10, font });
  if (input.company.email) {
    y -= 12;
    page.drawText(input.company.email, { x: marginX, y, size: 10, font });
  }

  // Buyer block
  y -= 28;
  page.drawText(labels.buyer, { x: marginX, y, size: 11, font: fontBold });
  y -= 14;
  page.drawText(input.buyer.name, { x: marginX, y, size: 10, font });
  y -= 12;
  page.drawText(input.buyer.email, { x: marginX, y, size: 10, font });
  if (input.buyer.taxId) {
    y -= 12;
    page.drawText(`${labels.taxId}: ${input.buyer.taxId}`, { x: marginX, y, size: 10, font });
  }

  // Divider
  y -= 24;
  page.drawLine({
    start: { x: marginX, y },
    end: { x: width - marginX, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });

  // Description + total
  y -= 28;
  page.drawText(labels.description, { x: marginX, y, size: 11, font: fontBold });
  page.drawText(labels.total, { x: width - marginX - 120, y, size: 11, font: fontBold });
  y -= 16;
  page.drawText(input.payment.description, { x: marginX, y, size: 11, font });
  page.drawText(formatAmount(input.payment.amount, input.payment.currency, locale), {
    x: width - marginX - 120,
    y,
    size: 11,
    font: fontBold,
  });

  // Status
  y -= 22;
  page.drawText(`${labels.status}: ${input.payment.status}`, {
    x: marginX,
    y,
    size: 10,
    font,
    color: rgb(0.25, 0.25, 0.25),
  });

  // Footer
  page.drawText(`${labels.transactionId}: ${input.payment.transactionId}`, {
    x: marginX,
    y: 60,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  page.drawText(`${labels.issuedBy}: ${input.company.name}`, {
    x: marginX,
    y: 46,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  return await pdfDoc.save();
}

/**
 * Numero de recibo humano-legivel derivado de id do payment + data.
 * Formato: YYYYMM-<8 chars>
 */
export function buildReceiptNumber(paymentId: string, createdAt: Date): string {
  const y = createdAt.getUTCFullYear();
  const m = String(createdAt.getUTCMonth() + 1).padStart(2, '0');
  const suffix = paymentId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `${y}${m}-${suffix}`;
}

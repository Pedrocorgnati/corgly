import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { PaymentStatus } from '@prisma/client';
import {
  buildReceiptNumber,
  generateReceiptPdf,
  receiptCompany,
} from '@/lib/receipts/pdf';

/**
 * GET /api/v1/billing/receipt/:paymentId
 *
 * Gera e retorna o PDF do recibo para um payment SUCCEEDED do usuario autenticado.
 * Admin pode baixar recibo de qualquer usuario.
 *
 * Response: application/pdf (stream) ou JSON de erro.
 */
type RouteCtx = { params: Promise<{ paymentId: string }> };

export async function GET(request: NextRequest, ctx: RouteCtx) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { paymentId } = await ctx.params;
  if (!paymentId) {
    return NextResponse.json(apiResponse(null, 'paymentId ausente'), { status: 400 });
  }

  try {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        user: { select: { id: true, name: true, email: true, preferredLanguage: true } },
        // Campos reais do model CreditBatch (prisma/schema.prisma): totalCredits
        // e usedCredits. Nao existe `credits` — pedir essa coluna fazia o Prisma
        // rejeitar o select em runtime e a rota devolver 500 para todo pagamento
        // com lote associado (ex.: PACK_10). O recibo descreve o que foi
        // COMPRADO, entao o numero certo e totalCredits.
        creditBatch: { select: { totalCredits: true } },
      },
    });

    if (!payment) {
      return NextResponse.json(apiResponse(null, 'Pagamento nao encontrado'), { status: 404 });
    }

    const isOwner = payment.userId === authResult.id;
    const isAdmin = authResult.role === 'ADMIN';
    if (!isOwner && !isAdmin) {
      return NextResponse.json(apiResponse(null, 'Acesso negado'), { status: 403 });
    }

    if (payment.status !== PaymentStatus.SUCCEEDED) {
      return NextResponse.json(
        apiResponse(null, 'Recibo disponivel apenas para pagamentos concluidos'),
        { status: 409 },
      );
    }

    const locale = mapPreferredLanguageToLocale(payment.user.preferredLanguage);
    const receiptNumber = buildReceiptNumber(payment.id, payment.createdAt);

    const pdfBytes = await generateReceiptPdf({
      company: receiptCompany(),
      buyer: {
        name: payment.user.name,
        email: payment.user.email,
      },
      payment: {
        id: payment.id,
        receiptNumber,
        createdAt: payment.createdAt,
        description:
          payment.creditBatch && payment.creditBatch.totalCredits > 0
            ? `Compra de ${payment.creditBatch.totalCredits} credito(s)`
            : 'Pagamento',
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        transactionId: payment.stripePaymentIntentId,
      },
      locale,
    });

    const body = new Uint8Array(pdfBytes);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="receipt-${receiptNumber}.pdf"`,
        'Cache-Control': 'private, no-store',
        'Content-Length': String(body.byteLength),
      },
    });
  } catch (err) {
    logger.error(
      'GET /api/v1/billing/receipt/:paymentId',
      { action: 'billing.receipt.get', userId: authResult.id, paymentId },
      err,
    );
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

function mapPreferredLanguageToLocale(lang: string): 'pt-BR' | 'it-IT' | 'en' | 'es-ES' {
  switch (lang) {
    case 'PT_BR':
      return 'pt-BR';
    case 'IT_IT':
      return 'it-IT';
    case 'ES_ES':
      return 'es-ES';
    case 'EN_US':
    default:
      return 'en';
  }
}

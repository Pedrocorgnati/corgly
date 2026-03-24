import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** DELETE /api/v1/recurring-patterns/{id} — soft-delete (isActive=false) com IDOR check */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    // IDOR check: garantir que o padrão pertence ao usuário autenticado
    const pattern = await prisma.recurringPattern.findFirst({
      where: { id, studentId: auth.id },
    });

    if (!pattern) {
      return NextResponse.json(apiResponse(null, 'Padrão não encontrado.'), { status: 404 });
    }

    // Soft-delete: preserva histórico de sessões recorrentes
    await prisma.recurringPattern.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json(apiResponse({ deleted: true }));
  } catch (err) {
    logger.error('DELETE /api/v1/recurring-patterns/[id]', { action: 'patterns.delete', userId: auth.id }, err);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

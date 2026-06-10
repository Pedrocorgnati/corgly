import { NextRequest, NextResponse } from 'next/server';
import { apiResponse } from '@/lib/auth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { withApiHandler } from '@/lib/api-handler';
import {
  equipmentCheckService,
  EQUIPMENT_ERROR_TYPES,
  type EquipmentErrorType,
} from '@/lib/equipment/equipment-check.service';

/**
 * GET /api/v1/equipment-check/guides[?errorType=camera|microphone|permission|bandwidth]
 *
 * Retorna os passos de resolução por tipo de erro (câmera, microfone, permissão
 * e banda) descritos em §12.3. Público (ajuda na pré-aula), com rate limit geral
 * por IP. Sem `errorType` retorna todos os guias; com `errorType` retorna apenas
 * o guia correspondente.
 */
export const GET = withApiHandler(async (request: NextRequest) => {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const rl = await checkRateLimit(`equip-guides:${ip}`, RATE_LIMITS.GENERAL);
  if (!rl.allowed) {
    return NextResponse.json(
      apiResponse(null, 'Muitas solicitações. Aguarde um instante.'),
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  const raw = request.nextUrl.searchParams.get('errorType');
  if (raw && !EQUIPMENT_ERROR_TYPES.includes(raw as EquipmentErrorType)) {
    return NextResponse.json(
      apiResponse(
        null,
        `errorType inválido. Use um de: ${EQUIPMENT_ERROR_TYPES.join(', ')}.`,
      ),
      { status: 400 },
    );
  }

  const guides = equipmentCheckService.getEquipmentGuides(
    (raw as EquipmentErrorType | null) ?? undefined,
  );

  return NextResponse.json(apiResponse({ guides }));
});

import { NextRequest, NextResponse } from 'next/server';
import { GenerateSlotsSchema } from '@/schemas/availability.schema';
import { availabilityService } from '@/services/availability.service';
import { apiResponse } from '@/lib/auth';
import { requireAdmin } from '@/lib/auth-guard';

/** GET /api/v1/availability?date=YYYY-MM-DD[&weeks=N] */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const date = searchParams.get('date');

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      apiResponse(null, 'Parâmetro date inválido. Use formato YYYY-MM-DD.'),
      { status: 400 },
    );
  }

  try {
    const slots = await availabilityService.getAvailable(date);
    return NextResponse.json(apiResponse(slots));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/** POST /api/v1/availability — admin: generate slots */
export async function POST(request: NextRequest) {
  // RESOLVED: Auth bypass
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const parsed = GenerateSlotsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiResponse(null, 'Dados inválidos.', parsed.error.issues[0]?.message ?? null),
        { status: 400 },
      );
    }

    const result = await availabilityService.generateSlots(parsed.data);
    return NextResponse.json(apiResponse(result, null, 'Slots gerados com sucesso.'), { status: 201 });
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { SignalSchema } from '@/schemas/session.schema';
import { sessionService } from '@/services/session.service';
import { apiResponse } from '@/lib/auth';

/** GET /api/v1/sessions/[id]/signal — WebRTC signaling (polling) */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = request.headers.get('x-user-id')!;
  const role = request.headers.get('x-user-role')!;

  try {
    const { id } = await params;
    const signals = await sessionService.pollSignals(id, role);
    return NextResponse.json(apiResponse(signals));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

/** POST /api/v1/sessions/[id]/signal — WebRTC signaling */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = request.headers.get('x-user-role')!;

  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = SignalSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(apiResponse(null, 'Dados inválidos.'), { status: 400 });
    }

    await sessionService.postSignal(id, role, parsed.data);
    return NextResponse.json(apiResponse(null, null, 'Sinal registrado.'));
  } catch {
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

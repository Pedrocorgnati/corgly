import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookie, apiResponse } from '@/lib/auth';
import { authService } from '@/services/auth.service';

/** POST /api/v1/auth/logout */
export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id');

  if (userId) {
    // Incrementa tokenVersion para invalidar todos os tokens JWT desta sessão
    await authService.logout(userId).catch(() => null);
  }

  const response = NextResponse.json(apiResponse(null, null, 'Logout realizado.'));
  clearAuthCookie(response);
  return response;
}

import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookie, apiResponse } from '@/lib/auth';

/** POST /api/v1/auth/logout */
export async function POST(request: NextRequest) {
  const response = NextResponse.json(apiResponse(null, null, 'Logout realizado.'));
  clearAuthCookie(response);
  return response;
}

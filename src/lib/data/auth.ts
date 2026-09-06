import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { internalApiOrigin } from '@/lib/internal-api';

export interface AuthUser {
  id?: string;
  name: string;
  email: string;
  role: string;
  creditBalance: number;
  emailConfirmed?: boolean;
  emailConfirmedAt?: string | null;
}

/**
 * Fetches the authenticated user from /api/v1/auth/me.
 * Wrapped in React.cache() so multiple calls in the same render cycle
 * (e.g., layout + page + server action) are deduplicated to a single HTTP request.
 *
 * Returns null if unauthenticated or request fails.
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  try {
    const cookieStore = await cookies();
    const res = await fetch(`${await internalApiOrigin()}/api/v1/auth/me`, {
      cache: 'no-store',
      headers: { Cookie: cookieStore.toString() },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data as AuthUser;
  } catch {
    return null;
  }
});

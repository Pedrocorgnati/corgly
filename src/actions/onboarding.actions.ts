'use server';

import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth/session';
import { COOKIE_NAME } from '@/lib/auth';
import { env } from '@/lib/env';

/**
 * Marks the onboarding as completed for the authenticated user.
 *
 * Calls PATCH /api/v1/auth/profile with the auth token forwarded via
 * Authorization header. Throws on failure so the caller can show feedback.
 *
 * Security: userId is validated against the session to prevent IDOR.
 */
export async function completeOnboarding(userId: string): Promise<void> {
  const session = await getSession();

  if (!session) {
    throw new Error('Unauthorized: no active session');
  }

  if (session.user.id !== userId) {
    throw new Error('Unauthorized: user ID mismatch');
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  const siteUrl = env.NEXT_PUBLIC_SITE_URL;

  const res = await fetch(`${siteUrl}/api/v1/auth/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      onboardingCompletedAt: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    console.error('[completeOnboarding] status:', res.status);
    throw new Error('Falha ao completar onboarding. Tente novamente.');
  }
}

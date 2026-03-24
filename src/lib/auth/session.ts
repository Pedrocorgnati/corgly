import 'server-only';
import { cookies } from 'next/headers';
import { verifyJWT, COOKIE_NAME } from '@/lib/auth';
import prisma from '@/lib/prisma';

export interface SessionUser {
  id: string;
  role: string;
  isFirstPurchase: boolean;
  onboardingCompletedAt: Date | null;
  emailConfirmed: boolean;
  tokenVersion: number;
}

export interface Session {
  user: SessionUser;
}

/**
 * Reads the JWT from the httpOnly cookie, verifies it, and returns the full
 * user record from the database. Returns null if the token is missing, invalid,
 * or revoked (tokenVersion mismatch).
 *
 * Use this in Server Components, Server Actions, and generateMetadata.
 * For Route Handlers / API routes, use requireAuth(request) from auth-guard.ts.
 */
export async function getSession(): Promise<Session | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const payload = verifyJWT(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        isFirstPurchase: true,
        onboardingCompletedAt: true,
        emailConfirmed: true,
        tokenVersion: true,
      },
    });

    if (!user) return null;

    // Invalidate sessions created before a password reset
    if (user.tokenVersion !== payload.version) return null;

    return { user: { ...user, role: user.role as string } };
  } catch {
    return null;
  }
}

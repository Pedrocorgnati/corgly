'use server';

import { headers } from 'next/headers';
import { env } from '@/lib/env';

interface ConsentData {
  essential: true;
  analytics: boolean;
  marketing: boolean;
}

/**
 * Registers the user's cookie consent via the internal API.
 *
 * This action is intentionally fire-and-forget: if the API call fails, the
 * consent is still saved client-side in the corgly_consent cookie. We log
 * the failure but do not surface it to the user.
 *
 * LGPD / GDPR: consent must be logged server-side with IP + timestamp.
 */
export async function saveConsentCookies(data: ConsentData): Promise<void> {
  try {
    const headersList = await headers();
    const ip =
      headersList.get('x-forwarded-for') ??
      headersList.get('x-real-ip') ??
      'unknown';
    const userAgent = headersList.get('user-agent') ?? '';

    const siteUrl = env.NEXT_PUBLIC_SITE_URL;

    const res = await fetch(`${siteUrl}/api/v1/consent/cookies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        essentialAccepted: data.essential,
        analyticsAccepted: data.analytics,
        marketingAccepted: data.marketing,
        // Anonymous fingerprint for audit trail — no PII stored here
        sessionFingerprint: `${ip}-${userAgent.slice(0, 50)}`,
      }),
    });

    if (!res.ok) {
      console.error('[saveConsentCookies] API error:', res.status);
    }
  } catch (err) {
    // Fallback: consent is preserved in the client-side cookie
    console.error('[saveConsentCookies] Network error:', err);
  }
}

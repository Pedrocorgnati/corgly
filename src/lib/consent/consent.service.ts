import type { ConsentSource, Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import {
  effectiveConsentQuerySchema,
  upsertConsentPreferencesSchema,
  type EffectiveConsent,
  type EffectiveConsentQuery,
  type UpsertConsentPreferencesInput,
} from './consent.schema';

const DEFAULT_EFFECTIVE_CONSENT: EffectiveConsent = {
  necessary: true,
  analytics: false,
  marketing: false,
  consentVersion: null,
  legalTextVersion: null,
  source: null,
  updatedAt: null,
};

function identityWhere(input: EffectiveConsentQuery): Prisma.CookieConsentWhereInput {
  if (input.userId) {
    return { userId: input.userId };
  }

  return { sessionFingerprint: input.sessionFingerprint };
}

function toEffectiveConsent(consent: {
  essentialAccepted: boolean;
  analyticsAccepted: boolean;
  marketingAccepted: boolean;
  consentVersion: string;
  legalTextVersion: string;
  source: ConsentSource;
  updatedAt: Date;
}): EffectiveConsent {
  return {
    necessary: true,
    analytics: consent.analyticsAccepted,
    marketing: consent.marketingAccepted,
    consentVersion: consent.consentVersion,
    legalTextVersion: consent.legalTextVersion,
    source: consent.source,
    updatedAt: consent.updatedAt,
  };
}

function toPrismaJson(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function getEffectiveConsent(input: EffectiveConsentQuery): Promise<EffectiveConsent> {
  const query = effectiveConsentQuerySchema.parse(input);
  const consent = await prisma.cookieConsent.findFirst({
    where: identityWhere(query),
    orderBy: { updatedAt: 'desc' },
  });

  return consent ? toEffectiveConsent(consent) : DEFAULT_EFFECTIVE_CONSENT;
}

export async function upsertConsentPreferences(input: UpsertConsentPreferencesInput): Promise<EffectiveConsent> {
  const data = upsertConsentPreferencesSchema.parse(input);
  const metadata = toPrismaJson(data.metadata);
  const consent = await prisma.$transaction(async (tx) => {
    const existing = await tx.cookieConsent.findFirst({
      where: identityWhere(data),
      orderBy: { updatedAt: 'desc' },
    });

    const payload = {
      essentialAccepted: true,
      analyticsAccepted: data.preferences.analytics,
      marketingAccepted: data.preferences.marketing,
      consentVersion: data.consentVersion,
      legalTextVersion: data.legalTextVersion,
      source: data.source,
      lastPreferenceSetAt: new Date(),
    };

    const current = existing
      ? await tx.cookieConsent.update({
          where: { id: existing.id },
          data: payload,
        })
      : await tx.cookieConsent.create({
          data: {
            userId: data.userId,
            sessionFingerprint: data.sessionFingerprint,
            ...payload,
          },
        });

    await tx.cookieConsentHistory.create({
      data: {
        consentId: current.id,
        userId: current.userId,
        sessionFingerprint: current.sessionFingerprint,
        essentialAccepted: true,
        analyticsAccepted: current.analyticsAccepted,
        marketingAccepted: current.marketingAccepted,
        consentVersion: current.consentVersion,
        legalTextVersion: current.legalTextVersion,
        source: current.source,
        metadata,
      },
    });

    return current;
  });

  return toEffectiveConsent(consent);
}

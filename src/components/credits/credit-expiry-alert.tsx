'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle, X } from 'lucide-react';
import { ROUTES } from '@/lib/constants/routes';
import { useLocalStorage } from '@/hooks/useLocalStorage';

const EXPIRY_THRESHOLD_DAYS = 7;
const DISMISS_KEY_PREFIX = 'creditExpiryDismissed_';

interface CreditBatch {
  expiresAt: string;
  totalCredits: number;
  usedCredits: number;
}

interface CreditExpiryAlertProps {
  batches: CreditBatch[];
}

function getDismissKey(): string {
  const today = new Date().toISOString().split('T')[0];
  return `${DISMISS_KEY_PREFIX}${today}`;
}

export function CreditExpiryAlert({ batches }: CreditExpiryAlertProps) {
  const t = useTranslations('credits.expiryAlert');
  const [isDismissed, setIsDismissed] = useLocalStorage<boolean>(getDismissKey(), false);

  const expiringBatches = useMemo(() => {
    const now = new Date();
    const threshold = new Date(now.getTime() + EXPIRY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

    return batches.filter((batch) => {
      const expiresAt = new Date(batch.expiresAt);
      const remaining = batch.totalCredits - batch.usedCredits;
      return expiresAt <= threshold && expiresAt > now && remaining > 0;
    });
  }, [batches]);

  if (isDismissed || expiringBatches.length === 0) {
    return null;
  }

  const totalExpiring = expiringBatches.reduce(
    (sum, b) => sum + (b.totalCredits - b.usedCredits),
    0
  );

  const soonestExpiry = expiringBatches.reduce((min, b) => {
    const d = new Date(b.expiresAt);
    return d < min ? d : min;
  }, new Date(expiringBatches[0].expiresAt));

  const daysUntil = Math.ceil(
    (soonestExpiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
  );

  function handleDismiss() {
    setIsDismissed(true);
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="relative bg-amber-600 text-white rounded-xl p-4 mb-6"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {t('message', { count: totalExpiring, days: daysUntil })}
          </p>
          <Link
            href={ROUTES.CREDITS}
            className="text-sm font-semibold underline underline-offset-2 hover:no-underline mt-1 inline-block"
          >
            {t('buyNow')}
          </Link>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={t('dismiss')}
          className="shrink-0 p-1 rounded-lg hover:bg-white/20 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

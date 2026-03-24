'use client';
import { STORAGE_KEYS } from '@/lib/constants';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PRICING } from '@/lib/constants';


const DISCOUNT_PERCENT = PRICING.INTRO_DISCOUNT * 100;

interface DiscountBannerProps {
  visible: boolean;
}

export function DiscountBanner({ visible }: DiscountBannerProps) {
  const t = useTranslations('credits.discount');
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEYS.SESSION.DISCOUNT_DISMISSED) === 'true';
    } catch {
      return false;
    }
  });

  if (!visible || dismissed) return null;

  const discountedPrice = PRICING.SINGLE * PRICING.INTRO_DISCOUNT;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(STORAGE_KEYS.SESSION.DISCOUNT_DISMISSED, 'true');
    } catch {
      // SSR safety
    }
    setDismissed(true);
  };

  return (
    <div
      role="alert"
      aria-label={t('title')}
      className="mb-6 flex items-center justify-between p-4 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 border border-amber-200 dark:border-amber-800 rounded-xl"
    >
      <div className="flex items-center gap-3">
        <span className="text-xl" aria-hidden="true">&#x26A1;</span>
        <div>
          <p className="font-semibold text-amber-800 dark:text-amber-200 text-sm">
            {t('message', { discount: DISCOUNT_PERCENT })} — $ {discountedPrice.toFixed(2)}
          </p>
        </div>
      </div>
      <button
        onClick={handleDismiss}
        className="text-amber-500 hover:text-amber-700 min-w-[44px] min-h-[44px] flex items-center justify-center"
        aria-label={t('dismiss')}
      >
        &#x2715;
      </button>
    </div>
  );
}

'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

export function CheckoutSuccessToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations('credits');
  const hasShown = useRef(false);

  useEffect(() => {
    if (hasShown.current) return;

    const checkoutStatus = searchParams.get('checkout');
    if (checkoutStatus === 'success') {
      hasShown.current = true;
      toast.success(t('checkoutSuccess'));

      // Clean URL without reload
      const url = new URL(window.location.href);
      url.searchParams.delete('checkout');
      router.replace(url.pathname + url.search, { scroll: false });
    }
  }, [searchParams, router, t]);

  return null;
}

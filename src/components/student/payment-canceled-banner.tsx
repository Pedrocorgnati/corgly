'use client';
import { UI_TIMING } from '@/lib/constants';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface PaymentCanceledBannerProps {
  visible: boolean;
}

export function PaymentCanceledBanner({ visible }: PaymentCanceledBannerProps) {
  const [show, setShow] = useState(visible);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setShow(false), UI_TIMING.BANNER_AUTO_HIDE);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!show) return null;

  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning flex items-center gap-2"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      Pagamento cancelado. Você pode tentar novamente quando quiser.
    </div>
  );
}

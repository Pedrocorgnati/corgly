'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { UI_TIMING } from '@/lib/constants';
import { missingMessage } from '@/lib/i18n/message-fallback';

interface PaymentCanceledBannerProps {
  visible: boolean;
}

/**
 * Aviso de checkout cancelado (`/credits?canceled=true`).
 *
 * Copy vem do dicionario (`credits.paymentCanceled.*`) como qualquer outro
 * texto do produto: esta e a MESMA rota da vitrine de planos, que ja e
 * traduzida nos quatro idiomas — texto fixo em pt-BR aqui aparecia em ingles,
 * espanhol e italiano para quem nao le portugues.
 */
export function PaymentCanceledBanner({ visible }: PaymentCanceledBannerProps) {
  const t = useTranslations('credits.paymentCanceled');
  const text = (key: string): string =>
    t.has(key) ? t(key) : missingMessage(`credits.paymentCanceled.${key}`, 'PaymentCanceledBanner');

  // O banner precisa acompanhar `visible` a CADA mudanca, nao so na montagem. A
  // pagina de creditos e um Server Component que recalcula `visible` a partir de
  // `?canceled=true`: voltar do checkout cancelado por navegacao client-side
  // troca a prop SEM remontar este componente. Com o estado semeado apenas no
  // primeiro render, o aluno voltava de um pagamento cancelado e nao recebia
  // aviso nenhum — acao sem feedback. O mesmo vale para a segunda visita, depois
  // que o auto-hide ja apagou o banner.
  //
  // O reset e feito DURANTE o render (padrao React para "ajustar estado quando
  // uma prop muda"), e nao dentro de um efeito: setState sincrono em efeito
  // renderiza em cascata — o banner apareceria um frame depois da prop mudar.
  const [autoHidden, setAutoHidden] = useState(false);
  const [lastVisible, setLastVisible] = useState(visible);
  if (lastVisible !== visible) {
    setLastVisible(visible);
    setAutoHidden(false);
  }

  const show = visible && !autoHidden;

  // Auto-hide: o aviso e transitorio, mas some por decisao propria (timeout),
  // nunca porque o estado ficou dessincronizado da prop.
  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => setAutoHidden(true), UI_TIMING.BANNER_AUTO_HIDE);
    return () => clearTimeout(timer);
  }, [show]);

  if (!show) return null;

  return (
    <div
      data-testid="credits-payment-canceled-banner"
      role="alert"
      className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning flex items-center gap-2"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        <strong className="font-semibold">{text('title')}</strong> {text('message')}
      </span>
    </div>
  );
}

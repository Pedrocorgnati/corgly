'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { completeOnboarding } from '@/actions/onboarding.actions';
import { OnboardingSlides } from '@/components/onboarding/onboarding-slides';
import { ROUTES } from '@/lib/constants/routes';

export default function OnboardingPage() {
  const router = useRouter();
  const t = useTranslations('onboarding');
  const { user } = useAuth();
  const userId = user?.id;
  const [isCompleting, setIsCompleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleComplete = useCallback(async () => {
    if (isCompleting) return;

    // Sessao do cliente ainda nao resolveu (ou /auth/me falhou): antes o clique
    // simplesmente nao fazia nada. Falha visivel, com nova tentativa possivel.
    if (!userId) {
      const message = t('complete_error');
      setErrorMessage(message);
      toast.error(message);
      return;
    }

    setIsCompleting(true);
    setErrorMessage(null);
    try {
      await completeOnboarding(userId);
      router.push(ROUTES.ONBOARDING_EQUIPMENT);
    } catch {
      // Zero Silencio: a falha era engolida (so `setIsCompleting(false)`), o
      // botao voltava ao normal e o aluno ficava preso no onboarding sem
      // nenhum sinal. Agora o erro aparece na tela E no toast, e o clique
      // continua disponivel para nova tentativa.
      const message = t('complete_error');
      setErrorMessage(message);
      toast.error(message);
      setIsCompleting(false);
    }
  }, [userId, isCompleting, router, t]);

  const handleSkip = useCallback(() => {
    router.push(ROUTES.DASHBOARD);
  }, [router]);

  return (
    <div data-testid="page-auth-onboarding">
      <OnboardingSlides
        onComplete={handleComplete}
        onSkip={handleSkip}
        isCompleting={isCompleting}
        errorMessage={errorMessage}
      />
    </div>
  );
}

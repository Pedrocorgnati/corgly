'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { completeOnboarding } from '@/actions/onboarding.actions';
import { OnboardingSlides } from '@/components/onboarding/onboarding-slides';
import { ROUTES } from '@/lib/constants/routes';

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;
  const [isCompleting, setIsCompleting] = useState(false);

  const handleComplete = useCallback(async () => {
    if (!userId || isCompleting) return;

    setIsCompleting(true);
    try {
      await completeOnboarding(userId);
      router.push(ROUTES.ONBOARDING_EQUIPMENT);
    } catch {
      // Allow retry on failure
      setIsCompleting(false);
    }
  }, [userId, isCompleting, router]);

  const handleSkip = useCallback(() => {
    router.push(ROUTES.DASHBOARD);
  }, [router]);

  return (
    <div data-testid="page-auth-onboarding">
      <OnboardingSlides
        onComplete={handleComplete}
        onSkip={handleSkip}
      />
    </div>
  );
}

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
  const [isCompleting, setIsCompleting] = useState(false);

  const handleComplete = useCallback(async () => {
    if (!user?.id || isCompleting) return;

    setIsCompleting(true);
    try {
      await completeOnboarding(user.id);
      router.push(ROUTES.CREDITS);
    } catch {
      // Allow retry on failure
      setIsCompleting(false);
    }
  }, [user?.id, isCompleting, router]);

  const handleSkip = useCallback(() => {
    router.push(ROUTES.DASHBOARD);
  }, [router]);

  return (
    <OnboardingSlides
      onComplete={handleComplete}
      onSkip={handleSkip}
    />
  );
}

'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { initAnalytics, track } from '@/lib/analytics/client';
import { AnalyticsEvents } from '@/lib/analytics/events';

/**
 * Mounted once in the root layout. Captures UTM on first visit, flushes queue,
 * and emits a VIEW_LANDING event on landing route transitions.
 */
export function AnalyticsProvider() {
  const pathname = usePathname();

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    if (!pathname) return;
    // Only landing / marketing routes fire VIEW_LANDING.
    if (pathname === '/' || pathname.startsWith('/ref/')) {
      track(AnalyticsEvents.VIEW_LANDING, { path: pathname });
    }
  }, [pathname]);

  return null;
}

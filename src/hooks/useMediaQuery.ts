'use client';

import { useEffect, useState } from 'react';

// ── Types ──

export interface UseMediaQueryReturn {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

// ── Breakpoints ──

const MOBILE_MAX = 639;
const TABLET_MIN = 640;
const TABLET_MAX = 1024;
const DESKTOP_MIN = 1025;

// ── Hook ──

export function useMediaQuery(): UseMediaQueryReturn {
  const [state, setState] = useState<UseMediaQueryReturn>({
    isMobile: false,
    isTablet: false,
    isDesktop: true, // Default to desktop for SSR
  });

  useEffect(() => {
    const mobileQuery = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`);
    const tabletQuery = window.matchMedia(`(min-width: ${TABLET_MIN}px) and (max-width: ${TABLET_MAX}px)`);
    const desktopQuery = window.matchMedia(`(min-width: ${DESKTOP_MIN}px)`);

    function update() {
      setState({
        isMobile: mobileQuery.matches,
        isTablet: tabletQuery.matches,
        isDesktop: desktopQuery.matches,
      });
    }

    // Set initial values
    update();

    mobileQuery.addEventListener('change', update);
    tabletQuery.addEventListener('change', update);
    desktopQuery.addEventListener('change', update);

    return () => {
      mobileQuery.removeEventListener('change', update);
      tabletQuery.removeEventListener('change', update);
      desktopQuery.removeEventListener('change', update);
    };
  }, []);

  return state;
}

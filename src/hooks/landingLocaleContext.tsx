'use client';

import { createContext } from 'react';
import type { Locale } from '../../i18n/config';

export const LandingLocaleContext = createContext<Locale | null>(null);

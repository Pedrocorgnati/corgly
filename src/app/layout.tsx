import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { getLocale, getTranslations } from 'next-intl/server';
import { buildAlternates } from '@/lib/seo/metadata';
import { SITE_URL } from '@/lib/constants/landing';
import { AppThemeProvider } from '@/components/shared/app-theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/hooks/useAuth';
import { CookieBanner } from '@/components/ui/cookie-banner';
import { AnalyticsProvider } from '@/components/shared/AnalyticsProvider';
import { DevOverlayLoader } from '@/components/dev/DevOverlayLoader';

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#4F46E5' },
    { media: '(prefers-color-scheme: dark)', color: '#818CF8' },
  ],
};

export const metadata: Metadata = {
  title: {
    template: '%s | Corgly',
    default: 'Corgly — Brazilian Portuguese Tutor Online | Private Live Lessons',
  },
  description:
    'Learn Brazilian Portuguese with a native tutor. Private live lessons. First lesson 50% off at US$ 12.50.',
  metadataBase: new URL(SITE_URL),
  alternates: buildAlternates('/'),
  openGraph: {
    title: 'Corgly — Brazilian Portuguese Tutor Online | Private Live Lessons',
    description:
      'Learn Brazilian Portuguese with a native tutor. Private live lessons. First lesson 50% off at US$ 12.50.',
    type: 'website',
    images: [
      {
        url: '/images/og-image-corgly.jpg',
        width: 1200,
        height: 630,
        alt: 'Corgly — Brazilian Portuguese Tutor Online | Private Live Lessons',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Corgly — Brazilian Portuguese Tutor Online | Private Live Lessons',
    description:
      'Learn Brazilian Portuguese with a native tutor. Private live lessons. First lesson 50% off at US$ 12.50.',
    images: ['/opengraph-image'],
    creator: '@corgly',
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: {
      'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION || '',
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Locale resolvido por cookie/Accept-Language em i18n/request.ts (nao ha
  // segmento [locale] na URL).
  const locale = await getLocale();
  const tSkip = await getTranslations('skipNav');

  return (
    // suppressHydrationWarning: next-themes injeta a classe de tema no <html> antes da hydration
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body data-testid="app-body" className="min-h-dvh bg-background text-foreground antialiased">
        <a data-testid="app-skip-nav-link" href="#main-content" className="skip-nav">
          {tSkip('label')}
        </a>
        <NextIntlClientProvider>
          <AppThemeProvider>
            <AuthProvider>
              <TooltipProvider>
                {children}
              </TooltipProvider>
            </AuthProvider>
            <Toaster position="top-right" richColors />
            <CookieBanner />
            <AnalyticsProvider />
          </AppThemeProvider>
        </NextIntlClientProvider>
        {process.env.NODE_ENV === 'development' && <DevOverlayLoader />}
      </body>
    </html>
  );
}

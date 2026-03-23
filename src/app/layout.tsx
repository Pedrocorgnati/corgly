import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/shared/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/hooks/useAuth';
import { CookieBanner } from '@/components/ui/cookie-banner';

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
    default: 'Corgly — Aprenda Português com Professor Nativo',
  },
  description: 'Aulas 1:1 ao vivo de português brasileiro com Pedro. Agende, aprenda e evolua com o Corgly Method.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://corgly.app'),
  openGraph: {
    title: 'Corgly — Aprenda Português com Professor Nativo',
    description: 'Aulas 1:1 ao vivo de português brasileiro com Pedro.',
    type: 'website',
    images: [
      {
        url: '/images/og-image-corgly.jpg',
        width: 1200,
        height: 630,
        alt: 'Corgly — Aprenda Português com Professor Nativo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Corgly — Aprenda Português com Professor Nativo',
    description: 'Aulas 1:1 ao vivo de português brasileiro com Pedro. Primeira aula 50% OFF.',
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
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <a href="#main-content" className="skip-nav">
          Pular para o conteúdo principal
        </a>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AuthProvider>
            <TooltipProvider>
              {children}
            </TooltipProvider>
          </AuthProvider>
          <Toaster position="top-right" richColors />
          <CookieBanner />
        </ThemeProvider>
      </body>
    </html>
  );
}

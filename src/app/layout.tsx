import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/shared/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

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
        /* @ASSET_PLACEHOLDER
        name: og-image-corgly
        type: image
        extension: jpg
        format: 1200:630
        dimensions: 1200x630
        description: Imagem de preview para compartilhamento nas redes sociais. Fundo indigo escuro (#312E81) com logo Corgly branco centralizado. Tagline "Aprenda português com professores nativos" em Inter Medium branco. Elementos decorativos sutis nas bordas.
        context: Meta tags Open Graph, compartilhamento social
        style: Alto contraste, limpo, legível em thumbnail pequeno
        mood: Profissional, confiável, premium
        colors: Background #312E81, texto #FFFFFF, decorações #4F46E5 com 20% opacity
        avoid: Fotos, muitos elementos, texto pequeno, cores claras de fundo
        */
        url: '/images/og-image-corgly.jpg',
        width: 1200,
        height: 630,
        alt: 'Corgly — Aprenda Português com Professor Nativo',
      },
    ],
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
          <TooltipProvider>
            {children}
          </TooltipProvider>
          <Toaster position="top-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}

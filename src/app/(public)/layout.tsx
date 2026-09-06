import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { PublicHeader } from '@/components/shared/public-header';
import { PublicFooter } from '@/components/shared/public-footer';
import { detectLocale } from '@/lib/detect-locale';
import { generateLandingMetadata } from '@/lib/seo/metadata';
import { ThemeProvider } from '@/components/shared/theme-provider';

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const locale = detectLocale(cookieStore);
  return generateLandingMetadata(locale);
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" forcedTheme="light" enableSystem={false}>
      <div className="min-h-dvh flex flex-col bg-background text-foreground">
        <PublicHeader />
        <main id="main-content" data-testid="main-content" className="flex-1 pt-[52px]">
          {children}
        </main>
        <PublicFooter />
      </div>
    </ThemeProvider>
  );
}

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { PublicHeader } from '@/components/shared/public-header';
import { PublicFooter } from '@/components/shared/public-footer';
import { detectLocale } from '@/lib/detect-locale';
import { generateLandingMetadata } from '@/lib/seo/metadata';

// Next.js injects <link rel="alternate" hreflang> tags from metadata.alternates.languages
export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const locale = detectLocale(cookieStore);
  return generateLandingMetadata(locale);
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <PublicHeader />
      <main id="main-content" className="flex-1 pt-16">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}

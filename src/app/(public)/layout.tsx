// A moldura publica (barra fixa, wrapper e rodape) tambem e CSS puro. Ver o
// cabecalho de `public-chrome.css`: nao adianta a home sobreviver sem o chunk
// de utilitarios do Tailwind se o header e o rodape caem junto com ele.
import './public-chrome.css';

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { PublicHeader } from '@/components/shared/public-header';
import { PublicFooter } from '@/components/shared/public-footer';
import { detectLocale } from '@/lib/detect-locale';
import { generateLandingMetadata } from '@/lib/seo/metadata';

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const locale = detectLocale(cookieStore);
  return generateLandingMetadata(locale);
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pc-shell">
      <PublicHeader />
      <main id="main-content" data-testid="main-content" className="pc-main">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}

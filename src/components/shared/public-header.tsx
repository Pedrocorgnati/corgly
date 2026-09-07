'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Menu } from 'lucide-react';
import { ROUTES } from '@/lib/constants/routes';
import { BrandLogo } from '@/components/brand/brand-logo';
import { ButtonLink } from '@/components/ui/button-link';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { LanguageFlags } from '@/components/landing/language-flags';

const NAV_LINKS = [
  { key: 'method' as const, href: '/#metodo' },
  { key: 'how_it_works' as const, href: '/#como-funciona' },
  { key: 'pricing' as const, href: ROUTES.PRICING },
  { key: 'faq' as const, href: '/#faq' },
];

/**
 * A barra em si e CSS puro (`src/app/(public)/public-chrome.css`), pelo mesmo
 * motivo da home: ela aparece no primeiro paint e nao pode depender do chunk
 * unico de utilitarios do Tailwind, que ja chegou vazio em producao. Isso vale
 * inclusive para o botao do menu mobile, que e visivel de cara em telas
 * pequenas — dai ele usar `pc-header__menu` em vez do `Button` do shadcn.
 *
 * O painel do `<Sheet>` segue em Tailwind de proposito: e uma sobreposicao que
 * so existe depois de um clique (portanto ja com JS e CSS no ar).
 *
 * `<LanguageFlags>` e compartilhado com `app-header` (area logada), entao ele
 * nao e reescrito: recebe a classe `pc-flags` e a moldura publica o redesenha
 * por descendencia em `public-chrome.css`, como ja e feito com `BrandLogo`.
 */
export function PublicHeader() {
  const t = useTranslations('landing.header');
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const isHome = pathname === '/';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const onHero = isHome && !scrolled;

  return (
    <header
      data-testid="header"
      className={onHero ? 'pc-header pc-header--hero' : 'pc-header pc-header--solid'}
    >
      <div className="pc-header__inner">
        <Link href={ROUTES.HOME} data-testid="header-logo" className="pc-header__logo">
          <BrandLogo
            variant={onHero ? 'light' : 'dark'}
            priority
            className={onHero ? 'pc-brand pc-brand--light' : 'pc-brand'}
          />
        </Link>

        <nav data-testid="header-nav" className="pc-header__nav" aria-label={t('nav_aria')}>
          {NAV_LINKS.map(({ key, href }) => (
            <Link
              key={key}
              href={href}
              data-testid={`header-nav-item-${key.replace(/_/g, '-')}`}
              className="pc-header__nav-link"
            >
              {t(`nav.${key}`)}
            </Link>
          ))}
        </nav>

        <div className="pc-header__actions">
          <LanguageFlags className="pc-flags" />
          <Link
            href={ROUTES.LOGIN}
            data-testid="header-login-button"
            className="pc-header__login"
          >
            {t('login')}
          </Link>

          <Sheet>
            <SheetTrigger
              render={
                <button
                  type="button"
                  data-testid="header-menu-toggle-button"
                  className="pc-header__menu"
                  aria-label={t('menuOpen')}
                />
              }
            >
              <Menu aria-hidden="true" />
            </SheetTrigger>
            <SheetContent data-testid="header-mobile-menu" side="right" className="w-72 p-0">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <nav className="flex flex-col gap-1 px-4 pt-12" aria-label={t('nav_aria')}>
                {NAV_LINKS.map(({ key, href }) => (
                  <Link
                    key={key}
                    href={href}
                    data-testid={`header-mobile-nav-item-${key.replace(/_/g, '-')}`}
                    className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    {t(`nav.${key}`)}
                  </Link>
                ))}
              </nav>
              <Separator className="my-3" />
              <div className="flex flex-col gap-2 px-4">
                <ButtonLink
                  href={ROUTES.LOGIN}
                  data-testid="header-mobile-login-button"
                  variant="ghost"
                  className="w-full justify-start"
                >
                  {t('login')}
                </ButtonLink>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

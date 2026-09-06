'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Menu } from 'lucide-react';
import { ROUTES } from '@/lib/constants/routes';
import { BrandLogo } from '@/components/brand/brand-logo';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button-link';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { LanguageFlags } from '@/components/landing/language-flags';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { key: 'method' as const, href: '/#metodo' },
  { key: 'how_it_works' as const, href: '/#como-funciona' },
  { key: 'pricing' as const, href: ROUTES.PRICING },
  { key: 'faq' as const, href: '/#faq' },
];

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
      className={cn(
        'fixed top-0 left-0 right-0 z-40 h-[52px] transition-colors duration-200',
        onHero
          ? 'border-transparent bg-transparent'
          : 'border-b border-black/5 bg-white/95 backdrop-blur-md',
      )}
    >
      <div className="max-w-[1120px] mx-auto h-full flex items-center justify-between px-5 md:px-6 gap-3">
        <Link href={ROUTES.HOME} data-testid="header-logo" className="flex items-center flex-shrink-0">
          <BrandLogo
            variant={onHero ? 'light' : 'dark'}
            priority
            markClassName="h-7"
            wordmarkClassName="text-[1.4rem] font-semibold"
          />
        </Link>

        <nav
          data-testid="header-nav"
          className="hidden md:flex items-center gap-9"
          aria-label={t('nav_aria')}
        >
          {NAV_LINKS.map(({ key, href }) => (
            <Link
              key={key}
              href={href}
              data-testid={`header-nav-item-${key.replace(/_/g, '-')}`}
              className={cn(
                'text-[14px] font-medium tracking-[0.01em] transition-colors duration-[120ms]',
                onHero ? 'text-white hover:text-white' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {t(`nav.${key}`)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2.5 sm:gap-3">
          <LanguageFlags />
          <ButtonLink
            href={ROUTES.LOGIN}
            data-testid="header-login-button"
            size="sm"
            className={cn(
              'inline-flex h-8 min-h-[32px] rounded-[10px] px-4 text-[13px] font-semibold shadow-none',
              onHero
                ? 'bg-white text-[#5b4a9a] hover:bg-white/90'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            {t('login')}
          </ButtonLink>

          <Sheet>
            <SheetTrigger
              render={
                <Button
                  data-testid="header-menu-toggle-button"
                  variant="ghost"
                  size="icon"
                  className={cn('md:hidden h-8 w-8', onHero && 'text-white hover:bg-white/10')}
                  aria-label={t('menuOpen')}
                />
              }
            >
              <Menu className="h-5 w-5" />
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

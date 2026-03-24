'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Menu } from 'lucide-react';
import { ROUTES } from '@/lib/constants/routes';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from './theme-toggle';
import { LanguageSelector } from './language-selector';

const NAV_LINKS = [
  { key: 'method' as const, href: ROUTES.HOME },
  { key: 'pricing' as const, href: ROUTES.PRICING },
  { key: 'content' as const, href: ROUTES.CONTENT },
];

export function PublicHeader() {
  const t = useTranslations('landing.header');

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-16 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="max-w-[1200px] mx-auto h-full flex items-center justify-between px-4 md:px-6">
        {/* Logo */}
        <Link href={ROUTES.HOME} className="flex items-center gap-2 flex-shrink-0">
          <Image
            src="/images/logo.svg"
            alt="Corgly"
            width={120}
            height={32}
            priority
            className="dark:hidden"
          />
          <Image
            src="/images/logo-dark.svg"
            alt="Corgly"
            width={120}
            height={32}
            priority
            className="hidden dark:block"
          />
        </Link>

        {/* Nav links (desktop) */}
        <nav className="hidden lg:flex items-center gap-6" aria-label={t('nav_aria')}>
          {NAV_LINKS.map(({ key, href }) => (
            <Link
              key={key}
              href={href}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-[120ms]"
            >
              {t(`nav.${key}`)}
            </Link>
          ))}
        </nav>

        {/* Mobile menu */}
        <Sheet>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label={t('menuOpen')}
              />
            }
          >
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent side="right" className="w-72 p-0">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <nav className="flex flex-col gap-1 px-4 pt-12" aria-label={t('nav_aria')}>
              {NAV_LINKS.map(({ key, href }) => (
                <Link
                  key={key}
                  href={href}
                  className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  {t(`nav.${key}`)}
                </Link>
              ))}
            </nav>
            <Separator className="my-3" />
            <div className="flex flex-col gap-2 px-4">
              <Link href={ROUTES.LOGIN}>
                <Button variant="ghost" className="w-full justify-start">
                  {t('login')}
                </Button>
              </Link>
              <Link href={ROUTES.REGISTER}>
                <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                  {t('register')}
                </Button>
              </Link>
            </div>
          </SheetContent>
        </Sheet>

        {/* Actions (desktop) */}
        <div className="hidden lg:flex items-center gap-2">
          <LanguageSelector />
          <ThemeToggle />
          <Link href={ROUTES.LOGIN}>
            <Button variant="ghost" size="sm">{t('login')}</Button>
          </Link>
          <Link href={ROUTES.REGISTER}>
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
              {t('register')}
            </Button>
          </Link>
        </div>

        {/* Mobile actions (theme + language always visible) */}
        <div className="flex lg:hidden items-center gap-1">
          <LanguageSelector />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

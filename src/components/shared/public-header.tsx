import Image from 'next/image';
import Link from 'next/link';
import { ROUTES } from '@/lib/constants/routes';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from './theme-toggle';
import { LanguageSelector } from './language-selector';

export function PublicHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-16 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="max-w-[1200px] mx-auto h-full flex items-center justify-between px-4 md:px-6">
        {/* Logo */}
        <Link href={ROUTES.HOME} className="flex items-center gap-2 flex-shrink-0">
          {/* @ASSET_PLACEHOLDER
          name: logo-corgly
          type: image
          extension: svg
          format: 180x40
          dimensions: 180x40
          description: Logo Corgly com símbolo de corgi estilizado à esquerda e wordmark "Corgly" à direita. Corgi minimalista com orelhas pontiagudas, expressão amigável, formas geométricas. Wordmark usa Inter Bold.
          context: Header público, navbar, landing page
          style: Minimalista, vetorial, sem gradientes, funciona em 32px
          mood: Profissional, amigável, confiável
          colors: Primary (#4F46E5) para símbolo, Text Primary (#111827) para wordmark
          avoid: Realismo, sombras, gradientes, mais de 2 cores
          */}
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
        <nav className="hidden lg:flex items-center gap-6">
          <Link
            href={ROUTES.HOME}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-[120ms]"
          >
            Início
          </Link>
          <Link
            href={ROUTES.PRICING}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-[120ms]"
          >
            Preços
          </Link>
          <Link
            href={ROUTES.CONTENT}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-[120ms]"
          >
            Conteúdo
          </Link>
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <LanguageSelector />
          <ThemeToggle />
          <Link href={ROUTES.LOGIN}>
            <Button variant="ghost" size="sm">Entrar</Button>
          </Link>
          <Link href={ROUTES.REGISTER}>
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
              Criar conta
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

'use client';

import { usePathname } from 'next/navigation';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

/*
 * Provider de tema unico da aplicacao.
 *
 * next-themes descarta provider aninhado: `ThemeProvider` faz
 * `useContext(ThemeContext) ? <>{children}</> : <Theme {...props} />`, ou seja,
 * um segundo provider dentro de outro vira um Fragment e TODAS as props dele
 * (inclusive `forcedTheme`) sao ignoradas em silencio. Por isso o tema por area
 * e decidido aqui, num unico provider, e nao por layout de route group.
 *
 * Area logada: respeita o ThemeToggle (`defaultTheme="system"`).
 * Area publica: travada em claro, porque a landing e as paginas legais usam
 * paleta clara literal e nao tem variante escura.
 *
 * A lista abaixo enumera as areas AUTENTICADAS de proposito: se uma rota nova
 * for esquecida aqui ela cai no claro, que e o modo seguro. A lista inversa
 * (enumerar as publicas) faria a rota esquecida nascer escura, que e exatamente
 * o defeito que este arquivo corrige.
 */
const AUTHENTICATED_ROOTS = [
  '/account',
  '/admin',
  '/analytics',
  '/billing',
  '/credits',
  '/dashboard',
  '/exercises',
  '/history',
  '/library',
  '/maintenance',
  '/onboarding',
  '/progress',
  '/schedule',
  '/session',
  '/support',
] as const;

function isAuthenticatedArea(pathname: string): boolean {
  return AUTHENTICATED_ROOTS.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';

  if (isAuthenticatedArea(pathname)) {
    return (
      <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
        {children}
      </NextThemesProvider>
    );
  }

  return (
    <NextThemesProvider attribute="class" forcedTheme="light" enableSystem={false}>
      {children}
    </NextThemesProvider>
  );
}

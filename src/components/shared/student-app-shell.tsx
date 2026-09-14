'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { AppHeader } from '@/components/shared/app-header';
import { StudentSidebar } from '@/components/shared/student-sidebar';
import { MobileStudentDrawer } from '@/components/mobile/mobile-student-drawer';
import { MobileBottomNav } from '@/components/mobile/mobile-bottom-nav';
import type { UserRole } from '@/lib/constants/enums';

/**
 * Casca das telas de aluno. O `user` declara EXATAMENTE o que a casca repassa:
 * `AppHeader` le name/email/role/creditBalance e a barra lateral e a gaveta leem
 * name/email/creditBalance.
 *
 * Nao ha campo de confirmacao de e-mail aqui: quem decide o banner e o layout
 * (`src/app/(student)/layout.tsx`), que le `emailConfirmed` do `AuthUser` e
 * renderiza `EmailConfirmationBanner` como filho desta casca.
 *
 * Modo tela cheia: a rota de tentativa (`/exercises/{id}`, D-008-2) renderiza
 * so `children`, sem header, sidebar, gaveta, bottom nav e sem os paddings do
 * `main` — o DrillShell ocupa a viewport inteira. A lista `/exercises` (sem
 * segundo segmento) e todas as demais telas seguem pelo branch normal. O
 * `id`/`data-testid` `main-content` existem nos dois modos (skip link e
 * testes apontam para ele).
 */
interface StudentAppShellProps {
  user: {
    name: string;
    email: string;
    role: UserRole;
    creditBalance: number;
  };
  children: React.ReactNode;
}

const FULLSCREEN_PATH = /^\/exercises\/[^/]+$/;

export function StudentAppShell({ user, children }: StudentAppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  if (FULLSCREEN_PATH.test(pathname)) {
    return (
      <div className="min-h-dvh bg-background">
        <main id="main-content" data-testid="main-content" className="min-h-dvh">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <AppHeader user={user} onMenuClick={() => setDrawerOpen(true)} />
      <StudentSidebar user={user} />
      <MobileStudentDrawer
        user={user}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
      <main
        id="main-content"
        data-testid="main-content"
        className="pt-16 pb-16 md:pb-0 lg:ml-60 min-h-dvh"
      >
        <div className="p-4 md:p-6">
          {/* O banner de confirmacao de e-mail chega dentro de `children`:
              quem o renderiza e o layout de (student). */}
          {children}
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}

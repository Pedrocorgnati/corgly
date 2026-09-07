'use client';

import { useState } from 'react';
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

export function StudentAppShell({ user, children }: StudentAppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

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

'use client';

import { useState } from 'react';
import { AppHeader } from '@/components/shared/app-header';
import { StudentSidebar } from '@/components/shared/student-sidebar';
import { MobileStudentDrawer } from '@/components/mobile/mobile-student-drawer';
import { MobileBottomNav } from '@/components/mobile/mobile-bottom-nav';
import type { UserRole } from '@/lib/constants/enums';

interface StudentAppShellProps {
  user: {
    name: string;
    email: string;
    role: UserRole;
    creditBalance: number;
    emailConfirmedAt?: string | null;
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
        className="pt-16 pb-16 md:pb-0 lg:ml-60 min-h-dvh"
      >
        <div className="p-4 md:p-6">
          {/* Email confirmation banner is rendered by the layout (EmailConfirmationBanner) */}
          {children}
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}

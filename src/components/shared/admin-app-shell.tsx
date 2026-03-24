'use client';

import { useState } from 'react';
import { AppHeader } from '@/components/shared/app-header';
import { AdminSidebar } from '@/components/shared/admin-sidebar';
import { MobileAdminDrawer } from '@/components/mobile/mobile-admin-drawer';
import type { UserRole } from '@/lib/constants/enums';

interface AdminAppShellProps {
  user: { name: string; email: string; role: UserRole; creditBalance: number };
  children: React.ReactNode;
}

export function AdminAppShell({ user, children }: AdminAppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-background">
      <AppHeader user={user} onMenuClick={() => setDrawerOpen(true)} />
      <AdminSidebar user={{ name: user.name, email: user.email }} />
      <MobileAdminDrawer
        user={{ name: user.name, email: user.email }}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
      <main
        id="main-content"
        className="pt-16 lg:ml-60 min-h-dvh"
      >
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

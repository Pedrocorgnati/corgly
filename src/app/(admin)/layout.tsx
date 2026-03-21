import { AdminSidebar } from '@/components/shared/admin-sidebar';
import { AppHeader } from '@/components/shared/app-header';

// TODO: Replace with real auth session from cookie
const MOCK_ADMIN = {
  name: 'Pedro Corgnati',
  email: 'pedro@corgly.app',
  role: 'ADMIN' as const,
  creditBalance: 0,
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <AppHeader user={MOCK_ADMIN} />
      <AdminSidebar user={MOCK_ADMIN} />
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

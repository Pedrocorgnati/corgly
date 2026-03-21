import { StudentSidebar } from '@/components/shared/student-sidebar';
import { AppHeader } from '@/components/shared/app-header';
import { MobileBottomNav } from '@/components/mobile/mobile-bottom-nav';

// TODO: Replace with real auth session from cookie
const MOCK_USER = {
  name: 'Pedro Aluno',
  email: 'aluno@exemplo.com',
  role: 'STUDENT' as const,
  creditBalance: 5,
};

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <AppHeader user={MOCK_USER} />
      <StudentSidebar user={MOCK_USER} />
      <main
        id="main-content"
        className="pt-16 pb-16 lg:pb-0 lg:ml-60 min-h-dvh"
      >
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}

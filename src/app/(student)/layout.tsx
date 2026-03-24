import { redirect } from 'next/navigation';
import { StudentAppShell } from '@/components/shared/student-app-shell';
import { EmailConfirmationBanner } from '@/components/shared/email-confirmation-banner';
import { ROUTES } from '@/lib/constants/routes';
import { UserRole } from '@/lib/constants/enums';
import { getAuthUser } from '@/lib/data/auth';

export const dynamic = 'force-dynamic';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();

  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  if (user.role === UserRole.ADMIN) {
    redirect(ROUTES.ADMIN_DASHBOARD);
  }

  if (user.role !== UserRole.STUDENT) {
    redirect(ROUTES.LOGIN);
  }

  return (
    <StudentAppShell user={user}>
      {/* ST008: Email confirmation banner — only shown when emailConfirmed is false */}
      <EmailConfirmationBanner emailConfirmed={user.emailConfirmed ?? true} />
      {children}
    </StudentAppShell>
  );
}

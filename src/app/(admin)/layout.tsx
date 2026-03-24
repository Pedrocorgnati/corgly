import { redirect } from 'next/navigation';
import { AdminAppShell } from '@/components/shared/admin-app-shell';
import { ROUTES } from '@/lib/constants/routes';
import { getAuthUser } from '@/lib/data/auth';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();

  if (!user || user.role !== 'ADMIN') {
    redirect(ROUTES.LOGIN);
  }

  return (
    <AdminAppShell user={user}>
      {children}
    </AdminAppShell>
  );
}

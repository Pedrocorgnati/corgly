import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { detectLocale } from '@/lib/detect-locale';

export const dynamic = 'force-dynamic';

export default async function BlogRootRedirect() {
  const cookieStore = await cookies();
  const headerList  = await headers();
  const locale = detectLocale(cookieStore, headerList.get('accept-language') ?? undefined);
  redirect(`/blog/${locale}`);
}

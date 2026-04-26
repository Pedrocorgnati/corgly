import type { Metadata } from 'next';
import { PageWrapper } from '@/components/shared';
import { ContentList } from '@/components/admin/ContentList';

export const metadata: Metadata = {
  title: 'Admin — Conteúdo',
};

export default function AdminContentPage() {
  return (
    <PageWrapper>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Conteúdo</h1>
        <p className="text-sm text-muted-foreground mt-1">Crie, traduza e publique posts/artigos</p>
      </div>
      <ContentList />
    </PageWrapper>
  );
}

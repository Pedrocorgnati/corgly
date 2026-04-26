import type { Metadata } from 'next';
import { PageWrapper } from '@/components/shared';
import { ContentEditor } from '@/components/admin/ContentEditor';

export const metadata: Metadata = {
  title: 'Admin — Novo conteúdo',
};

export default function NewContentPage() {
  return (
    <PageWrapper>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Novo conteúdo</h1>
      </div>
      <ContentEditor />
    </PageWrapper>
  );
}

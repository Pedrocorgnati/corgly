import type { Metadata } from 'next';
import { PageWrapper } from '@/components/shared';
import { BroadcastsClient } from '@/components/admin/BroadcastsClient';

export const metadata: Metadata = {
  title: 'Admin — Broadcasts de email',
};

export default function AdminBroadcastsPage() {
  return (
    <PageWrapper data-testid="page-admin-broadcasts">
      <div data-testid="admin-broadcasts-header" className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Broadcasts de email</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Envie comunicacoes em massa para um segmento permitido. Cada envio exige
          confirmacao, respeita quem cancelou o recebimento (unsubscribe) e registra
          provider, status e erro de cada entrega.
        </p>
      </div>
      <BroadcastsClient />
    </PageWrapper>
  );
}

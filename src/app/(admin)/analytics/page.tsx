import type { Metadata } from 'next';
import { AnalyticsFunnel } from '@/components/admin/AnalyticsFunnel';

export const metadata: Metadata = {
  title: 'Analytics',
};

export default function AnalyticsPage() {
  return (
    <main id="main-content" data-testid="page-analytics" className="container mx-auto px-4 py-8 space-y-6">
      <header data-testid="analytics-header">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Visao de aquisicao, conversao e engajamento.
        </p>
      </header>
      <AnalyticsFunnel />
    </main>
  );
}

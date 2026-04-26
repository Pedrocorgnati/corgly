import type { Metadata } from 'next';
import { PageWrapper } from '@/components/shared';
import { prisma } from '@/lib/prisma';
import { ReportGenerator } from '@/components/admin/ReportGenerator';

export const metadata: Metadata = {
  title: 'Admin — Relatórios',
};

async function getRecentDownloads() {
  return prisma.auditLog.findMany({
    where:   { action: 'report_exported' },
    select:  { id: true, adminId: true, resourceId: true, metadata: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take:    50,
  }).catch(() => []);
}

export default async function AdminReportsPage() {
  const recent = await getRecentDownloads();

  return (
    <PageWrapper>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
        <p className="text-sm text-muted-foreground mt-1">Gere e exporte dados da plataforma em CSV ou XLSX</p>
      </div>

      <ReportGenerator />

      <div className="mt-6 bg-card border border-border rounded-2xl p-6 shadow-sm">
        <h2 className="font-semibold text-foreground mb-4">Histórico (últimos 50 downloads)</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum download registrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4">Data</th>
                  <th className="py-2 pr-4">Tipo</th>
                  <th className="py-2 pr-4">Formato</th>
                  <th className="py-2 pr-4">Linhas</th>
                  <th className="py-2 pr-4">Admin ID</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => {
                  const meta = (r.metadata ?? {}) as { format?: string; rowCount?: number };
                  return (
                    <tr key={r.id} className="border-b border-border/50">
                      <td className="py-2 pr-4 whitespace-nowrap">{r.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</td>
                      <td className="py-2 pr-4">{r.resourceId}</td>
                      <td className="py-2 pr-4 uppercase">{meta.format ?? '—'}</td>
                      <td className="py-2 pr-4">{meta.rowCount ?? '—'}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{r.adminId.slice(0, 8)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}

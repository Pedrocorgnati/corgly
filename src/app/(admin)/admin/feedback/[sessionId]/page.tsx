import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Star } from 'lucide-react';
import { ROUTES } from '@/lib/constants/routes';

export const metadata: Metadata = {
  title: 'Admin — Feedback da Sessão',
};

interface Props {
  params: Promise<{ sessionId: string }>;
}

// TODO: Implementar backend — GET /api/v1/admin/sessions/{id}/feedback
export default async function AdminFeedbackPage({ params }: Props) {
  const { sessionId } = await params;

  if (!sessionId) notFound();

  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-2xl mx-auto">
      <nav className="text-sm text-muted-foreground mb-6 flex items-center gap-1.5">
        <Link href={ROUTES.ADMIN_SESSIONS} className="hover:text-foreground transition-colors">
          ← Sessões
        </Link>
        <span>/</span>
        <span className="text-foreground">Feedback</span>
      </nav>

      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <h1 className="text-xl font-bold text-foreground mb-2">Feedback da Sessão</h1>
        <p className="text-sm text-muted-foreground mb-6">ID: {sessionId.slice(0, 8)}</p>

        <div className="space-y-4">
          {['Claridade das explicações', 'Qualidade didática', 'Pontualidade', 'Engajamento'].map((dim) => (
            <div key={dim} className="flex items-center justify-between py-3 border-b border-border last:border-0">
              <p className="text-sm font-medium text-foreground">{dim}</p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className="h-4 w-4 text-muted-foreground"
                  />
                ))}
                <span className="ml-2 text-sm text-muted-foreground">—/5</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 p-4 bg-muted/30 rounded-xl">
          <p className="text-xs font-medium text-muted-foreground mb-1">Comentário</p>
          <p className="text-sm text-muted-foreground italic">Nenhum comentário</p>
        </div>
      </div>
    </div>
  );
}

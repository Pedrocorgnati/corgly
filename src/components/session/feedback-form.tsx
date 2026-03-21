'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Star, Loader2, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';
import { cn } from '@/lib/utils';

const DIMENSIONS = [
  { key: 'clarity', label: 'Claridade das explicações' },
  { key: 'didactics', label: 'Qualidade didática' },
  { key: 'punctuality', label: 'Pontualidade' },
  { key: 'engagement', label: 'Engajamento' },
] as const;

type DimensionKey = typeof DIMENSIONS[number]['key'];

function StarRating({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center disabled:cursor-not-allowed"
          aria-label={`${star} estrela${star > 1 ? 's' : ''}`}
        >
          <Star
            className={cn(
              'h-6 w-6 transition-colors',
              (hovered || value) >= star
                ? 'fill-[#D97706] text-[#D97706]'
                : 'text-muted-foreground',
            )}
          />
        </button>
      ))}
    </div>
  );
}

interface FeedbackFormProps {
  sessionId: string;
}

export function FeedbackForm({ sessionId }: FeedbackFormProps) {
  const router = useRouter();
  const [ratings, setRatings] = useState<Record<DimensionKey, number>>({
    clarity: 0,
    didactics: 0,
    punctuality: 0,
    engagement: 0,
  });
  const [comment, setComment] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const allRated = Object.values(ratings).every(v => v > 0);

  if (sent) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 text-center shadow-sm space-y-4">
        <CheckCircle2 className="h-12 w-12 text-[#059669] mx-auto" />
        <h2 className="text-xl font-bold text-foreground">Avaliação enviada!</h2>
        <p className="text-sm text-muted-foreground">
          Obrigada pelo seu feedback. Ele nos ajuda a melhorar continuamente.
        </p>
        <Link href={ROUTES.DASHBOARD} className={cn(buttonVariants(), 'w-full text-center')}>← Voltar ao dashboard</Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allRated) {
      toast.error('Avalie todas as dimensões para continuar.');
      return;
    }
    setIsLoading(true);
    try {
      // TODO: Implementar backend — POST /api/v1/sessions/{id}/feedback
      await new Promise((r) => setTimeout(r, 500));
      toast.error('Não implementado — execute /auto-flow execute');
    } catch {
      toast.error('Erro ao enviar avaliação. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
      <h1 className="text-xl font-bold text-foreground mb-6">Avaliar sua aula</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {DIMENSIONS.map((dim) => (
          <div key={dim.key}>
            <p className="text-sm font-medium text-foreground mb-1">{dim.label}</p>
            <StarRating
              value={ratings[dim.key]}
              onChange={(v) => setRatings(prev => ({ ...prev, [dim.key]: v }))}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground mt-1">1 = Ruim | 3 = Bom | 5 = Excelente</p>
          </div>
        ))}

        <div>
          <label className="text-sm font-medium text-foreground mb-1 block" htmlFor="comment">
            Comentário (opcional)
          </label>
          <textarea
            id="comment"
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 500))}
            placeholder="Compartilhe sua experiência..."
            rows={4}
            disabled={isLoading}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:opacity-50"
          />
          <p className="text-xs text-muted-foreground text-right mt-0.5">{comment.length}/500</p>
        </div>

        <Button
          type="submit"
          disabled={isLoading || !allRated}
          className="w-full h-12"
        >
          {isLoading ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" />Enviando...</>
          ) : (
            'Enviar avaliação'
          )}
        </Button>
      </form>
    </div>
  );
}

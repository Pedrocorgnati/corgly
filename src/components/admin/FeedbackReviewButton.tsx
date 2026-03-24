'use client';
import { API } from '@/lib/constants/routes';
import { API } from '@/lib/constants/routes';

import { useState } from 'react';
import { CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';

interface FeedbackReviewButtonProps {
  feedbackId: string;
  initialReviewed: boolean;
}

export function FeedbackReviewButton({ feedbackId, initialReviewed }: FeedbackReviewButtonProps) {
  const [reviewed, setReviewed] = useState(initialReviewed);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (reviewed) {
    return (
      <div className="flex items-center gap-2 text-sm text-success">
        <CheckCircle className="h-4 w-4" />
        <span>Revisado</span>
      </div>
    );
  }

  const handleReview = async () => {
    setLoading(true);
    setError(null);

    try {
      await apiClient.patch(API.ADMIN.FEEDBACK_REVIEW(feedbackId), {});
      setReviewed(true);
    } catch {
      setError('Erro ao marcar como revisado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleReview} disabled={loading} size="sm">
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Marcando...
          </>
        ) : (
          <>
            <CheckCircle className="h-4 w-4 mr-2" />
            Marcar como revisado
          </>
        )}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

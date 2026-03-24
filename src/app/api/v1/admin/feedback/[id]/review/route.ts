import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { apiResponse } from '@/lib/auth';
import { feedbackService } from '@/services/feedback.service';
import { auditLog } from '@/lib/audit/audit-logger';
import { AppError } from '@/lib/errors';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/v1/admin/feedback/[id]/review
 * Marks a feedback as reviewed by admin (idempotent — second call returns 200).
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { id: feedbackId } = await params;

  try {
    const feedback = await feedbackService.markReviewed(feedbackId);
    auditLog('ADMIN_FEEDBACK_REVIEW', { type: 'Feedback', id: feedbackId }, auth.id);
    return NextResponse.json(apiResponse(feedback), { status: 200 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        apiResponse(null, error.message, error.code),
        { status: error.status },
      );
    }
    console.error('PATCH /admin/feedback/[id]/review', error);
    return NextResponse.json(apiResponse(null, 'Erro interno.'), { status: 500 });
  }
}

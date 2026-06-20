// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockRequireAuth = vi.hoisted(() => vi.fn());
const mockPreviewSubscriptionChange = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({
  apiResponse: (data: unknown, error: string | null = null, message: string | null = null) => ({
    data,
    error,
    message,
  }),
}));
vi.mock('@/lib/auth-guard', () => ({ requireAuth: mockRequireAuth }));
vi.mock('@/lib/billing/subscription-preview.service', () => ({
  previewSubscriptionChange: mockPreviewSubscriptionChange,
}));

import { POST } from './route';
import { AppError } from '@/lib/errors';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/v1/billing/subscription/preview-change', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/billing/subscription/preview-change', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ id: 'user-1', role: 'STUDENT', tokenVersion: 0 });
    mockPreviewSubscriptionChange.mockResolvedValue({
      currentWeeklyFrequency: 2,
      requestedWeeklyFrequency: 4,
      changeType: 'upgrade',
      currency: 'usd',
      prorationAmountCents: 1200,
      estimatedTaxCents: 200,
      amountDueNowCents: 1400,
      effectiveAt: '2026-06-18T12:00:00.000Z',
      previewPayload: { weeklyFrequency: 4, prorationDate: 1781784000 },
    });
  });

  it('retorna preview financeiro para usuario autenticado', async () => {
    const res = await POST(request({ weeklyFrequency: 4 }));

    expect(res.status).toBe(200);
    expect(mockPreviewSubscriptionChange).toHaveBeenCalledWith('user-1', { weeklyFrequency: 4 });

    const body = await res.json();
    expect(body.data.previewPayload).toEqual({ weeklyFrequency: 4, prorationDate: 1781784000 });
  });

  it('retorna 400 para body invalido', async () => {
    const res = await POST(new NextRequest('http://localhost/api/v1/billing/subscription/preview-change', {
      method: 'POST',
      body: '',
    }));

    expect(res.status).toBe(400);
    expect(mockPreviewSubscriptionChange).not.toHaveBeenCalled();
  });

  it('propaga erro de negocio do servico', async () => {
    mockPreviewSubscriptionChange.mockRejectedValue(
      new AppError('PAYMENT_080', 'Nenhuma assinatura ativa encontrada.', 404),
    );

    const res = await POST(request({ weeklyFrequency: 3 }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Nenhuma assinatura ativa encontrada.');
  });
});

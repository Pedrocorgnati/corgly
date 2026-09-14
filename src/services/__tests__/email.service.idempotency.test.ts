// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailType, SupportedLanguage } from '@/lib/constants/enums';
import { EmailService, ResendProvider, type IEmailProvider } from '../email.service';

describe('EmailService idempotency key', () => {
  const send = vi.fn<IEmailProvider['send']>();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    send.mockResolvedValue(undefined);
  });

  it('propaga a mesma chave ao provider', async () => {
    const service = new EmailService({ send });

    await service.send({
      to: 'professor@corgly.test',
      type: EmailType.EXTERNAL_BUSY_CONFLICT,
      data: {
        inicio: '2026-09-09T14:00:00.000Z',
        fim: '2026-09-09T15:00:00.000Z',
        sessionId: 'sess-1',
      },
      locale: SupportedLanguage.PT_BR,
      idempotencyKey: 'external-busy-conflict/conf-1/1788962400000',
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: 'external-busy-conflict/conf-1/1788962400000',
    }));
  });

  it('recusa chave maior que o limite do provider antes de enviar', async () => {
    const service = new EmailService({ send });

    await expect(service.send({
      to: 'professor@corgly.test',
      type: EmailType.CONFIRM_EMAIL,
      data: { link: 'https://corgly.test/confirm' },
      idempotencyKey: 'x'.repeat(257),
    })).rejects.toThrow('params inválidos');

    expect(send).not.toHaveBeenCalled();
  });

  it('envia a chave no header Idempotency-Key do Resend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new ResendProvider('resend-test-key');

    await provider.send({
      to: 'professor@corgly.test',
      from: 'Corgly <no-reply@corgly.test>',
      subject: 'Conflito',
      html: '<p>Conflito</p>',
      idempotencyKey: 'external-busy-conflict/conf-1/1788962400000',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': 'external-busy-conflict/conf-1/1788962400000',
        }),
      }),
    );
  });
});

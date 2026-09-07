// @vitest-environment node
/**
 * Template `RECURRING_BOOKING_FAILED` — renderizacao direta.
 *
 * O defeito coberto aqui: o renderer lia `data.date`, `data.reason` e
 * `data.bookLink`, mas o unico produtor real (o cron de agendamento
 * recorrente) manda `{ dayOfWeek, startTime }` e, no caminho de credito,
 * `reason: 'insufficient_credits'`. O aluno recebia "Nao foi possivel criar a
 * aula recorrente para undefined", o motivo saia como chave crua em ingles e o
 * link de reagendamento nascia `href="undefined"`.
 *
 * Estes testes travam o contrato do renderer contra o payload REAL do cron,
 * nos quatro locales.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { emailService } from '@/services/email.service';
import { EmailType, SupportedLanguage } from '@/types/enums';

const LOCALES = [
  SupportedLanguage.PT_BR,
  SupportedLanguage.EN_US,
  SupportedLanguage.ES_ES,
  SupportedLanguage.IT_IT,
] as const;

// Copiado do produtor real (cron de recorrencia): terca-feira, 10:00.
const PAYLOAD_SEM_MOTIVO = { dayOfWeek: 2, startTime: '10:00' };
const PAYLOAD_COM_MOTIVO = { dayOfWeek: 2, startTime: '10:00', reason: 'insufficient_credits' };

function render(data: Record<string, unknown>, locale: SupportedLanguage) {
  return emailService.renderTemplate(EmailType.RECURRING_BOOKING_FAILED, data, locale);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('RECURRING_BOOKING_FAILED — payload do cron nos 4 locales', () => {
  for (const locale of LOCALES) {
    for (const [nome, payload] of [
      ['sem motivo', PAYLOAD_SEM_MOTIVO],
      ['com motivo', PAYLOAD_COM_MOTIVO],
    ] as const) {
      it(`${locale} / ${nome}: sem buraco de interpolacao no html`, () => {
        const { subject, html } = render(payload, locale);

        expect(subject).toBeTruthy();
        expect(html).not.toContain('undefined');
        expect(html).not.toContain('[object Object]');
        // A chave crua nunca chega ao aluno: motivo e texto localizado.
        expect(html).not.toContain('insufficient_credits');
        // href vazio e o mesmo defeito de href="undefined" com outra roupa.
        expect(html).not.toMatch(/href="\s*"/);
      });
    }
  }

  it('PT_BR: dia da semana e horario aparecem em portugues', () => {
    const { html } = render(PAYLOAD_SEM_MOTIVO, SupportedLanguage.PT_BR);
    expect(html).toContain('terça-feira');
    expect(html).toContain('10:00');
  });

  it('IT_IT: dia da semana e motivo aparecem em italiano', () => {
    const { html } = render(PAYLOAD_COM_MOTIVO, SupportedLanguage.IT_IT);
    expect(html).toContain('martedì');
    expect(html).toContain('Crediti insufficienti.');
  });

  it('sem NEXT_PUBLIC_APP_URL o link cai no dominio de producao', () => {
    // `undefined`, nao string vazia: `??` so cai no fallback em null/undefined.
    vi.stubEnv('NEXT_PUBLIC_APP_URL', undefined as unknown as string);
    const { html } = render(PAYLOAD_SEM_MOTIVO, SupportedLanguage.EN_US);
    expect(html).toContain('https://corgly.app/schedule');
  });
});

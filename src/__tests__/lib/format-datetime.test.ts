import { describe, it, expect, vi } from 'vitest';
import { formatDatetime, formatDualTimezone } from '@/lib/format-datetime';

// 2025-01-14T17:00:00Z — terça-feira
// UTC-3 (BRT, America/Sao_Paulo): 14:00
// CET (UTC+1, Europe/Rome): 18:00
const TEST_DATE = new Date('2025-01-14T17:00:00Z');

describe('formatDatetime', () => {
  it('formato short retorna weekday + data + hora no fuso correto', () => {
    const result = formatDatetime(TEST_DATE, 'America/Sao_Paulo', 'short', 'pt-BR');
    // Esperado: "Ter, 14/01 · 14:00" (BRT = UTC-3)
    expect(result).toMatch(/14\/01/);
    expect(result).toMatch(/14:00/);
    expect(result).toContain('·');
  });

  it('formato time-only retorna apenas hora', () => {
    const result = formatDatetime(TEST_DATE, 'America/Sao_Paulo', 'time-only', 'pt-BR');
    expect(result).toBe('14:00');
  });

  it('formato date-only retorna apenas data', () => {
    const result = formatDatetime(TEST_DATE, 'America/Sao_Paulo', 'date-only', 'pt-BR');
    // "14/01/2025" ou "14/01/25" dependendo do locale
    expect(result).toMatch(/14\/01/);
    expect(result).toMatch(/2025/);
  });

  it('formato long retorna data completa por extenso', () => {
    const result = formatDatetime(TEST_DATE, 'America/Sao_Paulo', 'long', 'pt-BR');
    expect(result).toMatch(/14/);
    expect(result).toMatch(/2025/);
    expect(result).toMatch(/14:00/);
  });

  it('converte UTC → Roma (Europe/Rome) corretamente', () => {
    const result = formatDatetime(TEST_DATE, 'Europe/Rome', 'time-only', 'en-US');
    expect(result).toBe('18:00');
  });

  it('usa UTC como fallback para timezone inválida', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = formatDatetime(TEST_DATE, 'Invalid/Timezone', 'time-only', 'en-US');
    // UTC = 17:00
    expect(result).toBe('17:00');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid timezone'),
    );
    warnSpy.mockRestore();
  });

  it('default format é short', () => {
    const result = formatDatetime(TEST_DATE, 'UTC');
    expect(result).toContain('·');
  });
});

describe('formatDualTimezone', () => {
  it('retorna dual timezone no formato HH:MM TZ / HH:MM TZ', () => {
    const result = formatDualTimezone(TEST_DATE, 'America/Sao_Paulo', 'Europe/Rome', 'en-US');
    expect(result).toContain('/');
    // Ambos os horários devem aparecer
    expect(result).toMatch(/14:00/);
    expect(result).toMatch(/18:00/);
  });

  it('retorna apenas primary se secondaryTz omitido', () => {
    const result = formatDualTimezone(TEST_DATE, 'America/Sao_Paulo', undefined, 'en-US');
    expect(result).not.toContain('/');
    expect(result).toMatch(/14:00/);
  });
});

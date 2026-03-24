import { describe, it, expect } from 'vitest';
import { formatCurrency, formatCurrencyCompact } from '@/lib/format-currency';

describe('formatCurrency', () => {
  it('formata USD em en-US corretamente', () => {
    expect(formatCurrency(2500, 'usd', 'en-US')).toBe('$25.00');
  });

  it('formata BRL em pt-BR corretamente', () => {
    const result = formatCurrency(12500, 'brl', 'pt-BR');
    // "R$\u00A0125,00" ou "R$ 125,00" dependendo do runtime
    expect(result).toMatch(/R\$[\s\u00A0]?125,00/);
  });

  it('formata EUR em it-IT corretamente', () => {
    const result = formatCurrency(2500, 'eur', 'it-IT');
    expect(result).toMatch(/25[.,]00\s*€|€\s*25[.,]00/);
  });

  it('formata valor zero sem ocultar', () => {
    const result = formatCurrency(0, 'usd', 'en-US');
    expect(result).toBe('$0.00');
  });

  it('formata valor negativo (reembolso)', () => {
    const result = formatCurrency(-2500, 'usd', 'en-US');
    expect(result).toBe('-$25.00');
  });

  it('cai no fallback USD para currency não suportada', () => {
    // 'usdc' mapeia para USD
    const result = formatCurrency(2500, 'usdc', 'en-US');
    expect(result).toBe('$25.00');
  });

  it('cai no fallback en-US para locale inválido', () => {
    const result = formatCurrency(2500, 'usd', 'invalid-locale-xyz');
    expect(result).toBe('$25.00');
  });
});

describe('formatCurrencyCompact', () => {
  it('omite decimais para valor inteiro', () => {
    expect(formatCurrencyCompact(2500, 'usd', 'en-US')).toBe('$25');
  });

  it('mantém decimais para valor não inteiro', () => {
    expect(formatCurrencyCompact(2550, 'usd', 'en-US')).toBe('$25.50');
  });

  it('funciona com BRL', () => {
    const result = formatCurrencyCompact(10000, 'brl', 'pt-BR');
    expect(result).toMatch(/R\$[\s\u00A0]?100/);
  });
});

// @vitest-environment node
import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Guarda do fallback UNICO de chave de traducao ausente.
 *
 * Dois eixos, porque o defeito tinha duas caras:
 *
 *  1. COMPORTAMENTO — a politica canonica precisa ser a certa. Fora de
 *     producao estoura (o defeito aparece onde da para consertar); em producao
 *     registra no logger e devolve rotulo legivel. String vazia em producao e
 *     regressao: rotulo mudo e defeito invisivel, pior que erro visivel.
 *  2. FONTE UNICA — antes existiam cinco copias locais de `missingMessage`
 *     espalhadas por componentes e paginas, com respostas DIFERENTES para o
 *     mesmo caso (uma delas devolvia ''). Deduplicar sem trancar a porta so
 *     adia: a proxima tela copia a funcao de novo. A varredura abaixo falha se
 *     qualquer arquivo de `src/` voltar a declarar a funcao localmente.
 */

const loggerError = vi.fn();
vi.mock('@/lib/logger', () => ({
  logger: {
    error: (...args: unknown[]) => loggerError(...args),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

const { missingMessage } = await import('@/lib/i18n/message-fallback');

const REPO_ROOT = process.cwd();
const SRC_DIR = path.join(REPO_ROOT, 'src');
const CANONICAL_MODULE = path.join(SRC_DIR, 'lib/i18n/message-fallback.ts');

/** Arquivos que carregavam uma copia local e agora consomem o modulo unico. */
const MIGRATED_CONSUMERS = [
  'src/components/billing/subscription-manager.tsx',
  'src/components/billing/CurrencySelector.tsx',
  'src/components/student/payment-canceled-banner.tsx',
  'src/app/(student)/billing/subscription/page.tsx',
  'src/app/(student)/billing/subscription/change-plan/page.tsx',
];

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      collectSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('missingMessage — politica canonica', () => {
  beforeEach(() => {
    loggerError.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('estoura fora de producao, citando chave e componente', () => {
    expect(process.env.NODE_ENV).not.toBe('production');
    expect(() => missingMessage('credits.pricing.checkoutError', 'PricingCards')).toThrowError(
      /credits\.pricing\.checkoutError.*PricingCards/,
    );
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('em producao registra no logger estruturado em vez de estourar', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => missingMessage('credits.currency.retry', 'CurrencySelector')).not.toThrow();
    expect(loggerError).toHaveBeenCalledTimes(1);
    expect(loggerError).toHaveBeenCalledWith('[i18n] chave de traducao ausente', {
      action: 'i18n.missing_key',
      component: 'CurrencySelector',
      messageKey: 'credits.currency.retry',
    });
  });

  it('em producao NUNCA devolve string vazia (rotulo mudo e defeito invisivel)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    for (const key of [
      'credits.subscription.title',
      'credits.paymentCanceled.message',
      'credits.currency.usdcNote',
      'a',
    ]) {
      const label = missingMessage(key, 'Qualquer');
      expect(label).not.toBe('');
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });

  it('em producao devolve rotulo humanizado, nunca a chave crua', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(missingMessage('credits.pricing.checkoutError', 'PricingCards')).toBe('Checkout error');
    expect(missingMessage('credits.pricing.fail_title', 'PricingCards')).toBe('Fail title');
    expect(missingMessage('credits.currency.loadError', 'CurrencySelector')).not.toContain('.');
  });
});

describe('missingMessage — fonte unica', () => {
  it('nenhum arquivo de src/ declara uma copia local da funcao', () => {
    const offenders = collectSourceFiles(SRC_DIR)
      .filter((file) => file !== CANONICAL_MODULE)
      .filter((file) => /\bfunction\s+missingMessage\b/.test(fs.readFileSync(file, 'utf-8')))
      .map((file) => path.relative(REPO_ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('os cinco consumidores migrados importam o modulo compartilhado', () => {
    for (const relative of MIGRATED_CONSUMERS) {
      const source = fs.readFileSync(path.join(REPO_ROOT, relative), 'utf-8');
      expect(source, `${relative} nao importa o fallback compartilhado`).toContain(
        "from '@/lib/i18n/message-fallback'",
      );
      expect(source, `${relative} usa missingMessage sem importar`).toMatch(
        /import\s*\{[^}]*\bmissingMessage\b[^}]*\}\s*from\s*'@\/lib\/i18n\/message-fallback'/,
      );
    }
  });
});

// @vitest-environment node
/**
 * Corrida de dois escritores sobre o mesmo slot em `blockSlot`/`unblockSlot`.
 *
 * Defeito ancorado: no HEAD anterior ao item 012, `blockSlot` (src/services/availability.service.ts
 * linhas 276-305) lia o slot com `findUnique`, decidia em memoria e escrevia com `update`, sem
 * transacao, sem lock de linha e sem predicado sobre o estado lido. Dois escritores concorrentes
 * resolviam os dois.
 *
 * O `$transaction` mockado aqui serializa os callbacks numa fila de promises — o papel do
 * `SELECT ... FOR UPDATE` — e o `$executeRaw` aplica o CAS de verdade sobre uma linha em memoria.
 * Molde da fila: tests/credits/fefo-atomic.test.ts (`createSerializableTransaction`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AvailabilityService } from '../availability.service';
import { AppError } from '@/lib/errors';

type Linha = { id: string; isBlocked: number; version: number };

const estado = vi.hoisted(() => ({
  linha: { id: 'slot-1', isBlocked: 0, version: 0 } as Linha,
}));

const mockPrisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  availabilitySlot: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

/**
 * Extrai o valor de `version` interpolado no template do CAS. O `$executeRaw` recebe
 * (strings, ...values); o ultimo valor e a version comparada.
 */
function versionDoCas(values: unknown[]): number {
  return values[values.length - 1] as number;
}

/**
 * `$transaction` serializado: cada callback so comeca depois que o anterior terminou.
 * Dentro dele, `$queryRaw` devolve uma COPIA da linha (o segundo escritor nao pode
 * compartilhar referencia com o primeiro) e `$executeRaw` aplica o CAS real.
 */
function armarTransacaoSerializada() {
  let fila: Promise<unknown> = Promise.resolve();
  mockPrisma.$transaction.mockImplementation((fn: (client: unknown) => unknown) => {
    const tx = {
      $queryRaw: vi.fn(async () => [{ ...estado.linha }]),
      $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const esperada = versionDoCas(values);
        if (esperada !== estado.linha.version) return 0;
        // O destino de isBlocked vem do proprio SQL emitido pelo metodo chamador,
        // que ja decidiu sob o lock. Nao inferir por toggle.
        const sql = Array.from(strings).join('?');
        estado.linha.isBlocked = sql.includes('isBlocked = true') ? 1 : 0;
        estado.linha.version += 1;
        return 1;
      }),
      session: { findFirst: vi.fn(async () => null) },
    };
    const run = fila.then(() => fn(tx));
    fila = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  });
}

describe('AvailabilityService — corrida de dois escritores no mesmo slot', () => {
  let service: AvailabilityService;

  beforeEach(() => {
    vi.clearAllMocks();
    estado.linha = { id: 'slot-1', isBlocked: 0, version: 0 };
    service = new AvailabilityService();
    armarTransacaoSerializada();
  });

  it('dois blockSlot concorrentes: um vence, o outro recebe 409 e a version sobe uma vez', async () => {
    const resultados = await Promise.allSettled([
      service.blockSlot('slot-1'),
      service.blockSlot('slot-1'),
    ]);

    const cumpridos = resultados.filter((r) => r.status === 'fulfilled');
    const rejeitados = resultados.filter((r) => r.status === 'rejected');

    expect(cumpridos).toHaveLength(1);
    expect(rejeitados).toHaveLength(1);

    const erro = (rejeitados[0] as PromiseRejectedResult).reason;
    expect(erro).toBeInstanceOf(AppError);
    expect((erro as AppError).status).toBe(409);

    expect(estado.linha.isBlocked).toBe(1);
    expect(estado.linha.version).toBe(1);
  });

  it('dois unblockSlot concorrentes: um vence, o outro recebe 409 e a version sobe uma vez', async () => {
    estado.linha = { id: 'slot-1', isBlocked: 1, version: 7 };

    const resultados = await Promise.allSettled([
      service.unblockSlot('slot-1'),
      service.unblockSlot('slot-1'),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejeitados = resultados.filter((r) => r.status === 'rejected');
    expect(rejeitados).toHaveLength(1);
    expect((rejeitados[0] as PromiseRejectedResult).reason).toBeInstanceOf(AppError);
    expect(((rejeitados[0] as PromiseRejectedResult).reason as AppError).status).toBe(409);

    expect(estado.linha.isBlocked).toBe(0);
    expect(estado.linha.version).toBe(8);
  });

  it('o perdedor nao sobrescreve o vencedor: block e unblock concorrentes deixam estado coerente', async () => {
    estado.linha = { id: 'slot-1', isBlocked: 1, version: 4 };

    const resultados = await Promise.allSettled([
      service.blockSlot('slot-1'),
      service.unblockSlot('slot-1'),
    ]);

    // O slot ja esta bloqueado: o blockSlot perde no guard AVAILABILITY_050, o unblockSlot passa.
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(1);

    // Exatamente uma escrita aceita: version subiu 1, nunca 2 em cima da mesma leitura.
    expect(estado.linha.version).toBe(5);
    expect(estado.linha.isBlocked).toBe(0);
  });
});

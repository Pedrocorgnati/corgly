// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// env mockado para o secret-crypto derivar a chave AES (ENCRYPTION_KEY).
vi.mock('@/lib/env', () => ({
  env: {
    ENCRYPTION_KEY: 'test-encryption-key-with-32+-characters!!',
    NODE_ENV: 'test',
  },
}));

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userMfaFindUnique: vi.fn(),
  userMfaUpsert: vi.fn(),
  userMfaUpdate: vi.fn(),
  userMfaUpdateMany: vi.fn(),
  recoveryDeleteMany: vi.fn(),
  recoveryCreateMany: vi.fn(),
  recoveryUpdate: vi.fn(),
  recoveryUpdateMany: vi.fn(),
  txUserUpdate: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    userMfa: { findUnique: mocks.userMfaFindUnique },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        userMfa: {
          upsert: mocks.userMfaUpsert,
          update: mocks.userMfaUpdate,
          updateMany: mocks.userMfaUpdateMany,
        },
        mfaRecoveryCode: {
          deleteMany: mocks.recoveryDeleteMany,
          createMany: mocks.recoveryCreateMany,
          update: mocks.recoveryUpdate,
          updateMany: mocks.recoveryUpdateMany,
        },
        user: { update: mocks.txUserUpdate },
      }),
    ),
  },
}));

import { encryptSecret } from '@/lib/mfa/secret-crypto';
import { generateTotp, generateTotpSecret, counterForTime } from '@/lib/mfa/totp';
import { hashRecoveryCode } from '@/lib/mfa/recovery';
import {
  initMfaEnrollment,
  verifyMfa,
  MfaError,
  MfaErrorCode,
} from './mfa.service';

const USER_ID = 'admin-1';
const NOW_MS = 1_700_000_100_000;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userFindUnique.mockResolvedValue({ email: 'admin@corgly.test' });
  mocks.userMfaUpsert.mockResolvedValue({ id: 'mfa-1' });
  mocks.recoveryDeleteMany.mockResolvedValue({ count: 0 });
  mocks.recoveryCreateMany.mockResolvedValue({ count: 10 });
  mocks.userMfaUpdate.mockResolvedValue({});
  mocks.userMfaUpdateMany.mockResolvedValue({ count: 1 });
  mocks.recoveryUpdate.mockResolvedValue({});
  mocks.recoveryUpdateMany.mockResolvedValue({ count: 1 });
  mocks.txUserUpdate.mockResolvedValue({});
});

describe('mfa.service initMfaEnrollment', () => {
  it('gera segredo, otpauth URI e 10 codigos de recuperacao e persiste hashes', async () => {
    const enrollment = await initMfaEnrollment(USER_ID);

    expect(enrollment.secret).toMatch(/^[A-Z2-7]+$/);
    expect(enrollment.otpauthUri).toContain('otpauth://totp/');
    expect(enrollment.recoveryCodes).toHaveLength(10);

    expect(mocks.userMfaUpsert).toHaveBeenCalledTimes(1);
    // conjunto anterior invalidado antes de gravar o novo
    expect(mocks.recoveryDeleteMany).toHaveBeenCalledWith({ where: { mfaId: 'mfa-1' } });
    expect(mocks.recoveryCreateMany).toHaveBeenCalledTimes(1);
    // hashes, nunca codigos em claro
    const createArg = mocks.recoveryCreateMany.mock.calls[0][0];
    for (const row of createArg.data) {
      expect(row.codeHash).not.toMatch(/-/); // codigo claro tem hifens; hash bcrypt nao
      expect(row.codeHash.startsWith('$2')).toBe(true);
    }
    // MFA fica desabilitado ate confirmar
    expect(mocks.txUserUpdate).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { mfaEnabled: false, mfaEnabledAt: null },
    });
  });

  it('reset: re-cadastrar gera segredo e codigos diferentes', async () => {
    const first = await initMfaEnrollment(USER_ID);
    const second = await initMfaEnrollment(USER_ID);
    expect(second.secret).not.toBe(first.secret);
    expect(second.recoveryCodes).not.toEqual(first.recoveryCodes);
    // cada reset invalida o conjunto anterior
    expect(mocks.recoveryDeleteMany).toHaveBeenCalledTimes(2);
  });
});

describe('mfa.service verifyMfa — TOTP', () => {
  const secret = generateTotpSecret();
  const counter = counterForTime(NOW_MS);

  it('confirma enrollment PENDING com codigo valido e ativa o MFA', async () => {
    mocks.userMfaFindUnique.mockResolvedValue({
      id: 'mfa-1',
      status: 'PENDING',
      secretEnc: encryptSecret(secret),
      lastUsedCounter: null,
      recoveryCodes: [],
    });

    const token = generateTotp(secret, counter);
    const res = await verifyMfa(USER_ID, token, NOW_MS);

    expect(res.justEnrolled).toBe(true);
    expect(res.enabled).toBe(true);
    expect(res.status).toBe('ACTIVE');
    expect(res.verifiedAtMs).toBe(NOW_MS);

    // persiste counter (anti-replay atomico via CAS) + ativa
    const updateArg = mocks.userMfaUpdateMany.mock.calls[0][0];
    expect(updateArg.data.status).toBe('ACTIVE');
    expect(updateArg.data.lastUsedCounter).toBe(BigInt(counter));
    // guarda CAS: so avanca quando o counter persistido ainda e null ou menor
    expect(updateArg.where.id).toBe('mfa-1');
    expect(updateArg.where.OR).toBeDefined();
    expect(mocks.txUserUpdate).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: expect.objectContaining({ mfaEnabled: true }),
    });
  });

  it('recusa codigo TOTP invalido', async () => {
    mocks.userMfaFindUnique.mockResolvedValue({
      id: 'mfa-1',
      status: 'PENDING',
      secretEnc: encryptSecret(secret),
      lastUsedCounter: null,
      recoveryCodes: [],
    });

    // codigo valido para um counter fora da janela => invalido para NOW_MS
    const wrong = generateTotp(secret, counter + 10);
    await expect(verifyMfa(USER_ID, wrong, NOW_MS)).rejects.toMatchObject({
      code: MfaErrorCode.INVALID_CODE,
    });
    expect(mocks.userMfaUpdateMany).not.toHaveBeenCalled();
  });

  it('recusa replay: mesmo codigo (counter ja consumido) — fast-path pre-tx', async () => {
    mocks.userMfaFindUnique.mockResolvedValue({
      id: 'mfa-1',
      status: 'ACTIVE',
      secretEnc: encryptSecret(secret),
      lastUsedCounter: BigInt(counter), // counter atual ja foi usado
      recoveryCodes: [],
    });

    const token = generateTotp(secret, counter);
    await expect(verifyMfa(USER_ID, token, NOW_MS)).rejects.toMatchObject({
      code: MfaErrorCode.CODE_REPLAYED,
    });
    expect(mocks.userMfaUpdateMany).not.toHaveBeenCalled();
  });

  it('anti-replay ATOMICO: CAS recusa mesmo com leitura stale (updateMany count=0)', async () => {
    // Leitura inicial stale: lastUsedCounter ainda parece null e passa a guarda
    // fast-path pre-tx; mas no banco o counter ja foi consumido por um request
    // concorrente entre o read e o write.
    mocks.userMfaFindUnique.mockResolvedValue({
      id: 'mfa-1',
      status: 'ACTIVE',
      secretEnc: encryptSecret(secret),
      lastUsedCounter: null,
      recoveryCodes: [],
    });
    mocks.userMfaUpdateMany.mockResolvedValue({ count: 0 });

    const token = generateTotp(secret, counter);
    await expect(verifyMfa(USER_ID, token, NOW_MS)).rejects.toMatchObject({
      code: MfaErrorCode.CODE_REPLAYED,
    });
    // o CAS condicional foi a unica salvaguarda que barrou o replay
    expect(mocks.userMfaUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('lanca NOT_INITIALIZED quando nao ha enrollment', async () => {
    mocks.userMfaFindUnique.mockResolvedValue(null);
    await expect(verifyMfa(USER_ID, '123456', NOW_MS)).rejects.toBeInstanceOf(MfaError);
    await expect(verifyMfa(USER_ID, '123456', NOW_MS)).rejects.toMatchObject({
      code: MfaErrorCode.NOT_INITIALIZED,
    });
  });
});

describe('mfa.service verifyMfa — codigos de recuperacao (uso unico)', () => {
  const secret = generateTotpSecret();
  const RECOVERY = 'ABCD-EFGH-JKLM';

  it('aceita codigo de recuperacao quando ATIVO e marca como usado', async () => {
    const codeHash = await hashRecoveryCode(RECOVERY);
    mocks.userMfaFindUnique.mockResolvedValue({
      id: 'mfa-1',
      status: 'ACTIVE',
      secretEnc: encryptSecret(secret),
      lastUsedCounter: null,
      recoveryCodes: [
        { id: 'rc-1', codeHash, usedAt: null },
        { id: 'rc-2', codeHash: await hashRecoveryCode('ZZZZ-ZZZZ-ZZZZ'), usedAt: null },
      ],
    });

    const res = await verifyMfa(USER_ID, RECOVERY, NOW_MS);
    expect(res.usedRecoveryCode).toBe(true);
    expect(res.recoveryCodesRemaining).toBe(1);
    // consumo atomico: updateMany condicionado a usedAt: null
    expect(mocks.recoveryUpdateMany).toHaveBeenCalledWith({
      where: { id: 'rc-1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('uso unico ATOMICO: CAS recusa recovery code consumido em corrida (updateMany count=0)', async () => {
    const codeHash = await hashRecoveryCode(RECOVERY);
    mocks.userMfaFindUnique.mockResolvedValue({
      id: 'mfa-1',
      status: 'ACTIVE',
      secretEnc: encryptSecret(secret),
      lastUsedCounter: null,
      recoveryCodes: [{ id: 'rc-1', codeHash, usedAt: null }],
    });
    // um request concorrente consumiu o codigo entre o read e o write
    mocks.recoveryUpdateMany.mockResolvedValue({ count: 0 });

    await expect(verifyMfa(USER_ID, RECOVERY, NOW_MS)).rejects.toMatchObject({
      code: MfaErrorCode.INVALID_CODE,
    });
    expect(mocks.recoveryUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('recusa codigo de recuperacao ja utilizado (uso unico)', async () => {
    const codeHash = await hashRecoveryCode(RECOVERY);
    mocks.userMfaFindUnique.mockResolvedValue({
      id: 'mfa-1',
      status: 'ACTIVE',
      secretEnc: encryptSecret(secret),
      lastUsedCounter: null,
      recoveryCodes: [{ id: 'rc-1', codeHash, usedAt: new Date(NOW_MS - 1000) }],
    });

    await expect(verifyMfa(USER_ID, RECOVERY, NOW_MS)).rejects.toMatchObject({
      code: MfaErrorCode.INVALID_CODE,
    });
  });

  it('recusa codigo de recuperacao durante enrollment PENDING', async () => {
    const codeHash = await hashRecoveryCode(RECOVERY);
    mocks.userMfaFindUnique.mockResolvedValue({
      id: 'mfa-1',
      status: 'PENDING',
      secretEnc: encryptSecret(secret),
      lastUsedCounter: null,
      recoveryCodes: [{ id: 'rc-1', codeHash, usedAt: null }],
    });

    await expect(verifyMfa(USER_ID, RECOVERY, NOW_MS)).rejects.toMatchObject({
      code: MfaErrorCode.RECOVERY_NOT_AVAILABLE,
    });
  });
});

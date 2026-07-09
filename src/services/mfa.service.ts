/**
 * @module services/mfa.service
 * Regras de negocio do MFA TOTP obrigatorio para admin (T-043).
 *
 * Responsabilidades:
 *  - Cadastro (enrollment): gera segredo TOTP cifrado + codigos de recuperacao
 *    de uso unico (hash). Segredo e codigos sao expostos UMA UNICA VEZ.
 *  - Verificacao: valida codigo TOTP (com guarda anti-replay por counter) ou
 *    codigo de recuperacao (uso unico). Confirma o enrollment pendente e marca
 *    `mfaEnabled` no usuario.
 *  - Reset/regeneracao: re-cadastrar substitui o segredo e invalida o conjunto
 *    anterior de codigos de recuperacao.
 *
 * Anti-replay: o ultimo time-step (counter) consumido e persistido; codigos de
 * counter menor ou igual sao recusados (impede reuso do mesmo TOTP).
 */

import 'server-only';
import { prisma } from '@/lib/prisma';
import {
  generateTotpSecret,
  buildOtpauthUri,
  verifyTotp,
  looksLikeTotpCode,
  TOTP_DEFAULT_WINDOW,
} from '@/lib/mfa/totp';
import { encryptSecret, decryptSecret } from '@/lib/mfa/secret-crypto';
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
} from '@/lib/mfa/recovery';

const MFA_ISSUER = 'Corgly';

export type MfaStatusValue = 'NONE' | 'PENDING' | 'ACTIVE';

/** Codigos de erro canonicos do dominio MFA. */
export const MfaErrorCode = {
  USER_NOT_FOUND: 'MFA_USER_NOT_FOUND',
  NOT_INITIALIZED: 'MFA_NOT_INITIALIZED',
  INVALID_CODE: 'MFA_INVALID_CODE',
  CODE_REPLAYED: 'MFA_CODE_REPLAYED',
  RECOVERY_NOT_AVAILABLE: 'MFA_RECOVERY_NOT_AVAILABLE',
} as const;
export type MfaErrorCode = (typeof MfaErrorCode)[keyof typeof MfaErrorCode];

export class MfaError extends Error {
  constructor(public readonly code: MfaErrorCode) {
    super(code);
    this.name = 'MfaError';
  }
}

export interface MfaStatusView {
  enabled: boolean;
  status: MfaStatusValue;
  confirmedAt: string | null;
  recoveryCodesRemaining: number;
}

export interface MfaEnrollment {
  /** Segredo base32 — exibido uma unica vez. */
  secret: string;
  /** otpauth:// URI para QR code — exibido uma unica vez. */
  otpauthUri: string;
  /** Codigos de recuperacao em claro — exibidos uma unica vez. */
  recoveryCodes: string[];
}

export interface MfaVerifyResult {
  enabled: boolean;
  status: MfaStatusValue;
  /** epoch (ms) da verificacao — alimenta o claim `mfaAt` da sessao. */
  verifiedAtMs: number;
  /** true se o enrollment pendente foi confirmado nesta verificacao. */
  justEnrolled: boolean;
  /** true se um codigo de recuperacao foi consumido. */
  usedRecoveryCode: boolean;
  recoveryCodesRemaining: number;
}

/**
 * (Re)inicia o cadastro de MFA para um admin.
 *
 * Sempre cria um enrollment PENDING com segredo novo e conjunto novo de codigos
 * de recuperacao, invalidando qualquer cadastro anterior (semantica de reset).
 * O MFA so volta a ficar ATIVO apos `verifyMfa` confirmar o codigo TOTP.
 */
export async function initMfaEnrollment(userId: string): Promise<MfaEnrollment> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user) {
    throw new MfaError(MfaErrorCode.USER_NOT_FOUND);
  }

  const secret = generateTotpSecret();
  const secretEnc = encryptSecret(secret);
  const otpauthUri = buildOtpauthUri({
    secretBase32: secret,
    accountName: user.email,
    issuer: MFA_ISSUER,
  });

  const recoveryCodes = generateRecoveryCodes();
  const hashed = await Promise.all(recoveryCodes.map((c) => hashRecoveryCode(c)));

  await prisma.$transaction(async (tx) => {
    const mfa = await tx.userMfa.upsert({
      where: { userId },
      create: {
        userId,
        secretEnc,
        status: 'PENDING',
        confirmedAt: null,
        lastUsedCounter: null,
        lastVerifiedAt: null,
      },
      update: {
        secretEnc,
        status: 'PENDING',
        confirmedAt: null,
        lastUsedCounter: null,
        lastVerifiedAt: null,
      },
    });

    // Invalida o conjunto anterior e grava o novo (hash apenas).
    await tx.mfaRecoveryCode.deleteMany({ where: { mfaId: mfa.id } });
    await tx.mfaRecoveryCode.createMany({
      data: hashed.map((codeHash) => ({ mfaId: mfa.id, codeHash })),
    });

    // Enquanto pendente, MFA nao esta efetivamente habilitado.
    await tx.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaEnabledAt: null },
    });
  });

  return { secret, otpauthUri, recoveryCodes };
}

/** Retorna a visao de status do MFA para um usuario. */
export async function getMfaStatus(userId: string): Promise<MfaStatusView> {
  const mfa = await prisma.userMfa.findUnique({
    where: { userId },
    include: { recoveryCodes: { select: { usedAt: true } } },
  });

  if (!mfa) {
    return {
      enabled: false,
      status: 'NONE',
      confirmedAt: null,
      recoveryCodesRemaining: 0,
    };
  }

  const remaining = mfa.recoveryCodes.filter((c) => c.usedAt === null).length;
  return {
    enabled: mfa.status === 'ACTIVE',
    status: mfa.status as MfaStatusValue,
    confirmedAt: mfa.confirmedAt ? mfa.confirmedAt.toISOString() : null,
    recoveryCodesRemaining: remaining,
  };
}

/**
 * Verifica um codigo TOTP de 6 digitos OU um codigo de recuperacao.
 *
 * - TOTP: valida na janela de tolerancia e recusa counter ja consumido
 *   (anti-replay). Pode confirmar um enrollment PENDING (=> ATIVO).
 * - Recovery: so disponivel quando o MFA ja esta ATIVO; uso unico.
 *
 * @param nowMs instante atual (injetavel para testes determinísticos).
 */
export async function verifyMfa(
  userId: string,
  code: string,
  nowMs: number = Date.now(),
): Promise<MfaVerifyResult> {
  const mfa = await prisma.userMfa.findUnique({
    where: { userId },
    include: { recoveryCodes: true },
  });
  if (!mfa) {
    throw new MfaError(MfaErrorCode.NOT_INITIALIZED);
  }

  const secret = decryptSecret(mfa.secretEnc);
  const now = new Date(nowMs);
  const wasPending = mfa.status === 'PENDING';

  let usedRecoveryCode = false;
  let matchedCounter: number | null = null;
  let consumedRecoveryId: string | null = null;

  if (looksLikeTotpCode(code)) {
    const res = verifyTotp(secret, code, { nowMs, window: TOTP_DEFAULT_WINDOW });
    if (!res.valid || res.counter === null) {
      throw new MfaError(MfaErrorCode.INVALID_CODE);
    }
    // Anti-replay: counter precisa ser estritamente maior que o ultimo usado.
    if (mfa.lastUsedCounter !== null && BigInt(res.counter) <= mfa.lastUsedCounter) {
      throw new MfaError(MfaErrorCode.CODE_REPLAYED);
    }
    matchedCounter = res.counter;
  } else {
    // Codigo de recuperacao so e aceito apos o MFA estar ativo.
    if (mfa.status !== 'ACTIVE') {
      throw new MfaError(MfaErrorCode.RECOVERY_NOT_AVAILABLE);
    }
    for (const rc of mfa.recoveryCodes) {
      if (rc.usedAt !== null) continue;
      if (await verifyRecoveryCode(code, rc.codeHash)) {
        consumedRecoveryId = rc.id;
        break;
      }
    }
    if (!consumedRecoveryId) {
      throw new MfaError(MfaErrorCode.INVALID_CODE);
    }
    usedRecoveryCode = true;
  }

  const willBeActive = true; // qualquer verificacao bem-sucedida deixa/mantem ATIVO

  await prisma.$transaction(async (tx) => {
    if (matchedCounter !== null) {
      // Anti-replay ATOMICO (compare-and-set): so avanca o counter se o valor
      // persistido ainda for estritamente menor que o casado. A leitura inicial
      // (fora da tx) e apenas fast-path; este updateMany condicional e a unica
      // salvaguarda real sob concorrencia. Dois requests com o MESMO TOTP: o
      // primeiro avanca (count=1), o segundo encontra lastUsedCounter ja >=
      // matchedCounter, afeta 0 linhas e e recusado como replay.
      const advanced = await tx.userMfa.updateMany({
        where: {
          id: mfa.id,
          OR: [
            { lastUsedCounter: null },
            { lastUsedCounter: { lt: BigInt(matchedCounter) } },
          ],
        },
        data: {
          lastVerifiedAt: now,
          lastUsedCounter: BigInt(matchedCounter),
          ...(wasPending ? { status: 'ACTIVE', confirmedAt: now } : {}),
        },
      });
      if (advanced.count === 0) {
        throw new MfaError(MfaErrorCode.CODE_REPLAYED);
      }
    }

    if (consumedRecoveryId) {
      // Uso unico ATOMICO (compare-and-set): so consome se ainda nao usado. Sob
      // corrida, o segundo request com o mesmo codigo afeta 0 linhas (usedAt ja
      // != null) e e recusado, garantindo consumo unico.
      const consumed = await tx.mfaRecoveryCode.updateMany({
        where: { id: consumedRecoveryId, usedAt: null },
        data: { usedAt: now },
      });
      if (consumed.count === 0) {
        throw new MfaError(MfaErrorCode.INVALID_CODE);
      }
      await tx.userMfa.update({
        where: { id: mfa.id },
        data: { lastVerifiedAt: now },
      });
    }

    if (wasPending) {
      await tx.user.update({
        where: { id: userId },
        data: { mfaEnabled: true, mfaEnabledAt: now },
      });
    }
  });

  const remaining = mfa.recoveryCodes.filter(
    (c) => c.usedAt === null && c.id !== consumedRecoveryId,
  ).length;

  return {
    enabled: willBeActive,
    status: 'ACTIVE',
    verifiedAtMs: nowMs,
    justEnrolled: wasPending,
    usedRecoveryCode,
    recoveryCodesRemaining: remaining,
  };
}

export const mfaService = {
  initMfaEnrollment,
  getMfaStatus,
  verifyMfa,
};

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

/**
 * @module lib/equipment/equipment-check.service
 *
 * Serviço de equipment check (pré-aula): valida câmera, microfone, permissões e
 * banda do aluno antes de entrar numa sessão de vídeo, persiste o resultado
 * (autenticado ou anônimo) e expõe os guias de resolução por tipo de erro
 * (§12.3 do LLD).
 *
 * Persistência: enquanto o domínio Prisma dedicado `EquipmentCheck` não existe
 * (task de criação do model foi adiada nesta rodada do loop 05-27), o resultado
 * é gravado na tabela genérica `AuditLog` (model audit_logs). Quando o model
 * dedicado for adicionado, basta trocar a implementação de `persistResult` sem
 * mudar a superfície pública deste serviço nem as rotas.
 */

// ---------------------------------------------------------------------------
// Tipos de erro suportados (§12.3)
// ---------------------------------------------------------------------------

export const EQUIPMENT_ERROR_TYPES = [
  'camera',
  'microphone',
  'permission',
  'bandwidth',
] as const;

export type EquipmentErrorType = (typeof EQUIPMENT_ERROR_TYPES)[number];

// ---------------------------------------------------------------------------
// Schema de validação do POST
// ---------------------------------------------------------------------------

const DeviceCheckSchema = z.object({
  ok: z.boolean(),
  /** Identificador do dispositivo escolhido (opcional). */
  deviceLabel: z.string().max(200).optional(),
  /** Tipo do erro detectado quando ok === false. */
  errorType: z.enum(EQUIPMENT_ERROR_TYPES).optional(),
  /** Mensagem técnica do navegador (DOMException.name, etc). */
  detail: z.string().max(500).optional(),
});

export const EquipmentCheckSchema = z.object({
  camera: DeviceCheckSchema,
  microphone: DeviceCheckSchema,
  permission: DeviceCheckSchema,
  /** Banda estimada em Mbps de upload (opcional, medição é best-effort). */
  bandwidthMbps: z.number().nonnegative().max(10_000).optional(),
  bandwidthOk: z.boolean(),
  /** Sessão alvo, quando o check é feito antes de uma aula específica. */
  sessionId: z.string().cuid().optional(),
  userAgent: z.string().max(500).optional(),
});

export type EquipmentCheckInput = z.infer<typeof EquipmentCheckSchema>;

export interface EquipmentCheckActor {
  /** ID do usuário autenticado, ou null quando anônimo. */
  userId: string | null;
  /** IP de origem (para auditoria e correlação anti-abuso). */
  ip: string;
}

export interface PersistedEquipmentCheck {
  id: string;
  createdAt: string;
  passed: boolean;
  anonymous: boolean;
  failedChecks: EquipmentErrorType[];
}

// ---------------------------------------------------------------------------
// Guias de resolução por tipo de erro (§12.3)
// ---------------------------------------------------------------------------

export interface EquipmentGuide {
  errorType: EquipmentErrorType;
  title: string;
  steps: string[];
}

export const EQUIPMENT_GUIDES: Record<EquipmentErrorType, EquipmentGuide> = {
  camera: {
    errorType: 'camera',
    title: 'Não conseguimos acessar sua câmera',
    steps: [
      'Feche outros aplicativos que possam estar usando a câmera (Zoom, Meet, Teams).',
      'Clique no ícone de cadeado na barra de endereço e libere o acesso à câmera para este site.',
      'Selecione a câmera correta no seletor de dispositivos, caso você tenha mais de uma.',
      'Reinicie o navegador e refaça o teste de câmera.',
    ],
  },
  microphone: {
    errorType: 'microphone',
    title: 'Não conseguimos captar seu microfone',
    steps: [
      'Confirme que o microfone não está no mudo pelo sistema operacional ou pelo fone.',
      'Libere o acesso ao microfone nas permissões do navegador para este site.',
      'Selecione o microfone correto e verifique se o nível de entrada se move ao falar.',
      'Teste o microfone em outro aplicativo para descartar falha de hardware.',
    ],
  },
  permission: {
    errorType: 'permission',
    title: 'As permissões de câmera e microfone estão bloqueadas',
    steps: [
      'Abra as configurações de privacidade do navegador e localize este site.',
      'Conceda permissão de câmera e microfone e remova qualquer bloqueio anterior.',
      'No sistema operacional, habilite o acesso do navegador aos dispositivos de mídia.',
      'Recarregue a página depois de conceder as permissões.',
    ],
  },
  bandwidth: {
    errorType: 'bandwidth',
    title: 'Sua conexão pode prejudicar a chamada',
    steps: [
      'Feche abas, downloads e streamings que estejam consumindo banda.',
      'Prefira conexão cabeada ou aproxime-se do roteador Wi-Fi.',
      'Faça um teste de velocidade; recomendamos ao menos 2 Mbps de upload.',
      'Se a conexão estiver instável, reduza a qualidade do vídeo antes de entrar.',
    ],
  },
};

/**
 * Retorna os guias de resolução. Quando `errorType` é informado, retorna apenas
 * o guia correspondente; caso contrário, retorna todos os guias.
 */
export function getEquipmentGuides(
  errorType?: EquipmentErrorType,
): EquipmentGuide[] {
  if (errorType) return [EQUIPMENT_GUIDES[errorType]];
  return EQUIPMENT_ERROR_TYPES.map((t) => EQUIPMENT_GUIDES[t]);
}

// ---------------------------------------------------------------------------
// Avaliação + persistência do resultado
// ---------------------------------------------------------------------------

/** Lista os checks que falharam, mapeados para o tipo de erro canônico. */
export function evaluateFailures(input: EquipmentCheckInput): EquipmentErrorType[] {
  const failed: EquipmentErrorType[] = [];
  if (!input.permission.ok) failed.push('permission');
  if (!input.camera.ok) failed.push('camera');
  if (!input.microphone.ok) failed.push('microphone');
  if (!input.bandwidthOk) failed.push('bandwidth');
  return failed;
}

/**
 * Persiste o resultado do equipment check (autenticado OU anônimo).
 *
 * Grava na tabela `audit_logs` com `resourceType = 'equipment_check'` e
 * `adminId` recebendo o userId quando autenticado ou o sentinel `anonymous`.
 * Nunca lança para o caller: falha de persistência loga e devolve o resultado
 * em memória, para que o aluno consiga seguir o fluxo de pré-aula (Zero Silêncio
 * via log; o check não deve travar a entrada na sessão).
 */
export async function persistResult(
  input: EquipmentCheckInput,
  actor: EquipmentCheckActor,
): Promise<PersistedEquipmentCheck> {
  const failedChecks = evaluateFailures(input);
  const passed = failedChecks.length === 0;
  const anonymous = actor.userId === null;
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  try {
    await prisma.auditLog.create({
      data: {
        id,
        action: 'equipment_check.recorded',
        resourceType: 'equipment_check',
        resourceId: input.sessionId ?? id,
        adminId: actor.userId ?? 'anonymous',
        metadata: {
          passed,
          anonymous,
          failedChecks,
          ip: actor.ip,
          bandwidthMbps: input.bandwidthMbps ?? null,
          camera: input.camera,
          microphone: input.microphone,
          permission: input.permission,
          bandwidthOk: input.bandwidthOk,
          userAgent: input.userAgent ?? null,
          sessionId: input.sessionId ?? null,
        },
      },
    });
  } catch (err) {
    // Nunca silenciar: loga, mas devolve o resultado para não travar a pré-aula.
    console.error('[equipment-check] falha ao persistir resultado', {
      id,
      anonymous,
      passed,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { id, createdAt, passed, anonymous, failedChecks };
}

export const equipmentCheckService = {
  schema: EquipmentCheckSchema,
  evaluateFailures,
  persistResult,
  getEquipmentGuides,
};

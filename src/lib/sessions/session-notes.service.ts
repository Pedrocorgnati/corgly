import 'server-only';

import { prisma } from '@/lib/prisma';
import { UserRole } from '@/lib/constants/enums';

/**
 * Resultado da leitura read-only do caderno pos-aula (ST-12, PRD §11.1 / §12.5).
 *
 * Discriminated union: o consumidor faz switch em `status` e nunca acessa
 * `plainText`/`updatedAt` fora do ramo `ok` (Zero Estados Indefinidos).
 */
export type SessionNotesResult =
  | { status: 'ok'; bookingId: string; plainText: string; updatedAt: Date }
  | { status: 'empty'; bookingId: string }
  | { status: 'not_found' }
  | { status: 'forbidden' };

export interface SessionNotesService {
  getReadOnlyNotes(bookingId: string, currentUserId: string): Promise<SessionNotesResult>;
}

class SessionNotesServiceImpl implements SessionNotesService {
  /**
   * Resolve o caderno persistente de uma sessao em modo somente-leitura.
   *
   * Renderiza apenas `SessionDocument.plainTextSnapshot` (texto persistido pelo
   * editor colaborativo via T-017). O `yjsState` binario NUNCA e carregado aqui,
   * pois nao ha edicao ao vivo nesta superficie.
   *
   * Regra RBAC (§12.5). Autorizado se e somente se:
   *   1. e o aluno dono da sessao (`Session.studentId == currentUserId`); OU
   *   2. e o professor vinculado a sessao; OU
   *   3. possui papel admin (suporte, somente leitura).
   *
   * Nota de mapeamento (Zero Assumido): o schema desta plataforma single-tutor
   * NAO possui papel TUTOR nem campo de tutor em `AvailabilitySlot`. O professor
   * da disponibilidade e o suporte sao o mesmo papel `ADMIN`. Por isso as
   * condicoes 2 e 3 colapsam em `role === ADMIN`. O ramo admin abaixo fica
   * implementado e reusavel por uma rota admin de suporte; observar que a rota
   * `(student)/history/[bookingId]/notes` desta task e gated pelo layout do
   * grupo `(student)`, que redireciona ADMIN para o dashboard admin — logo o
   * acesso admin se concretiza por uma superficie admin separada que reusa este
   * mesmo service, nunca por divergencia de regra.
   *
   * Contrato BDD:
   *   SUCCESS  — autorizado + snapshot nao-vazio -> { status: 'ok', ... }
   *   EMPTY    — autorizado + sessao sem documento ou snapshot vazio -> { status: 'empty' }
   *   NOT_FOUND— bookingId nao corresponde a nenhuma Session -> { status: 'not_found' }
   *   FORBIDDEN— usuario sem nenhuma das 3 condicoes -> { status: 'forbidden' }
   *   ERROR    — falha de servidor/consulta propaga (tratada como 500 no consumidor)
   */
  async getReadOnlyNotes(bookingId: string, currentUserId: string): Promise<SessionNotesResult> {
    const session = await prisma.session.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        studentId: true,
        document: {
          select: { plainTextSnapshot: true, updatedAt: true },
        },
      },
    });

    if (!session) {
      return { status: 'not_found' };
    }

    let authorized = session.studentId === currentUserId;

    if (!authorized) {
      const user = await prisma.user.findUnique({
        where: { id: currentUserId },
        select: { role: true },
      });
      authorized = user?.role === UserRole.ADMIN;
    }

    if (!authorized) {
      return { status: 'forbidden' };
    }

    const snapshot = session.document?.plainTextSnapshot;
    if (!snapshot || snapshot.trim().length === 0) {
      return { status: 'empty', bookingId };
    }

    return {
      status: 'ok',
      bookingId,
      plainText: snapshot,
      updatedAt: session.document!.updatedAt,
    };
  }
}

export const sessionNotesService: SessionNotesService = new SessionNotesServiceImpl();

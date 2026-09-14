// @vitest-environment node
/**
 * Trava a paridade entre os enums nativos do MySQL expostos pelo
 * `@prisma/client` e seus espelhos de runtime.
 *
 * Este arquivo e a UNICA excecao a CT-2: nenhum arquivo de producao importa
 * `ExerciseItemKind` de `@prisma/client` - o tipo vem sempre de
 * `@/lib/exercises`. O teste precisa dos dois lados justamente para compara-los;
 * sem essa importacao ele nao existe. A excecao vale para este caminho, nao
 * para `*.test.ts` em geral.
 *
 * Comparacao por valor E ordem (`toEqual` sobre arrays, nunca `toContain` nem
 * `Set`): a ordem e a ordem de armazenamento do `ENUM(...)` nativo, e reordenar
 * reinterpreta linha ja gravada. E exatamente essa garantia que um espelho
 * escrito a mao perde.
 */
import {
  ExerciseAssignmentStatus as PrismaExerciseAssignmentStatus,
  ExerciseAttemptStatus as PrismaExerciseAttemptStatus,
  ExerciseItemKind as PrismaExerciseItemKind,
} from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  ExerciseAssignmentStatus as ConstantExerciseAssignmentStatus,
  ExerciseAttemptStatus as ConstantExerciseAttemptStatus,
  ExerciseItemKind as ConstantExerciseItemKind,
} from '@/lib/constants/enums';

import { EXERCISE_ITEM_KINDS } from './exercise-item.schema';

describe('paridade dos enums Prisma e espelhos de runtime', () => {
  it('mantem ExerciseItemKind igual no Prisma, na tupla Zod e na constante', () => {
    const prismaValues = Object.values(PrismaExerciseItemKind);
    const zodValues = [...EXERCISE_ITEM_KINDS];
    const constantValues = Object.values(ConstantExerciseItemKind);

    expect(prismaValues).toEqual(zodValues);
    expect(constantValues).toEqual(zodValues);
    expect(prismaValues).toEqual(constantValues);
  });

  it('mantem ExerciseAssignmentStatus igual no Prisma e na constante', () => {
    expect(Object.values(PrismaExerciseAssignmentStatus)).toEqual(
      Object.values(ConstantExerciseAssignmentStatus),
    );
  });

  it('mantem ExerciseAttemptStatus igual no Prisma e na constante', () => {
    expect(Object.values(PrismaExerciseAttemptStatus)).toEqual(
      Object.values(ConstantExerciseAttemptStatus),
    );
  });

  it('mantem as chaves do enum iguais aos proprios valores', () => {
    // O Prisma gera o enum como objeto const com chave === valor. Se isso mudar,
    // `Object.values` deixa de ser comparavel com a tupla e o teste acima passa
    // a medir outra coisa.
    expect(Object.keys(PrismaExerciseItemKind)).toEqual(Object.values(PrismaExerciseItemKind));
    expect(Object.keys(ConstantExerciseItemKind)).toEqual(
      Object.values(ConstantExerciseItemKind),
    );
  });

  it('nao perdeu nem ganhou valor em relacao aos 14 declarados', () => {
    expect(Object.values(PrismaExerciseItemKind)).toHaveLength(EXERCISE_ITEM_KINDS.length);
    expect(Object.values(ConstantExerciseItemKind)).toHaveLength(EXERCISE_ITEM_KINDS.length);
    expect(EXERCISE_ITEM_KINDS).toHaveLength(14);
  });
});

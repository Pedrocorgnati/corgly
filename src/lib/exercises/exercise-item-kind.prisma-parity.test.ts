// @vitest-environment node
/**
 * Trava a paridade entre o enum nativo `ExerciseItemKind` do MySQL (exposto
 * pelo `@prisma/client`) e a tupla `EXERCISE_ITEM_KINDS`, que e a fonte.
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
import { ExerciseItemKind } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { EXERCISE_ITEM_KINDS } from './exercise-item.schema';

describe('paridade ExerciseItemKind (enum nativo x tupla Zod)', () => {
  it('expoe os mesmos valores, na mesma ordem', () => {
    expect(Object.values(ExerciseItemKind)).toEqual([...EXERCISE_ITEM_KINDS]);
  });

  it('mantem as chaves do enum iguais aos proprios valores', () => {
    // O Prisma gera o enum como objeto const com chave === valor. Se isso mudar,
    // `Object.values` deixa de ser comparavel com a tupla e o teste acima passa
    // a medir outra coisa.
    expect(Object.keys(ExerciseItemKind)).toEqual(Object.values(ExerciseItemKind));
  });

  it('nao perdeu nem ganhou valor em relacao aos 14 declarados', () => {
    expect(Object.values(ExerciseItemKind)).toHaveLength(EXERCISE_ITEM_KINDS.length);
    expect(EXERCISE_ITEM_KINDS).toHaveLength(14);
  });
});

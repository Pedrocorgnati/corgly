/**
 * Distribuicao das letras da alternativa correta.
 *
 * A fonte (corgly-classes/rules/09-secao6-multipla-escolha.md) descreve o
 * comportamento do gerador de DOCX:
 *
 *   "Quando todas as respostas ficam concentradas numa posicao, o gerador move
 *    a alternativa correta e distribui as letras em ciclo a, b, c, d, sem
 *    alterar o JSON de origem."
 *
 * A aula 1 e legada (sem o campo `correta`), entao a correta e sempre a
 * primeira alternativa no JSON. Renderizar nessa ordem entregaria oito questoes
 * com gabarito "a" — o aluno acerta tudo sem ler. Esta funcao reproduz a mesma
 * regra do gerador: a questao de indice `i` tem a correta na posicao `i % 4`,
 * e as outras tres alternativas mantem a ordem relativa da fonte.
 *
 * Deterministico de proposito: nada de `Math.random()`. A ordem precisa ser
 * identica no servidor e no cliente (senao o React acusa hydration mismatch) e
 * identica entre recarregamentos, para o aluno poder conferir a mesma prova com
 * outra pessoa.
 */

import {
  OPTION_LETTERS,
  OPTIONS_PER_QUESTION,
  type ExerciseOption,
  type ExerciseQuestion,
  type SourceQuestion,
} from './types';

/**
 * Move o item de `from` para `to` preservando a ordem relativa dos demais.
 * Indices fora da faixa retornam a lista intacta — quem valida o dado e o
 * catalogo, esta funcao nunca joga fora nem duplica alternativa.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const result = [...items];
  if (from < 0 || from >= result.length || to < 0 || to >= result.length || from === to) {
    return result;
  }
  const [moved] = result.splice(from, 1);
  result.splice(to, 0, moved);
  return result;
}

/** Posicao que a alternativa correta ocupa na questao de indice `questionIndex`. */
export function targetCorrectPosition(questionIndex: number): number {
  return questionIndex % OPTIONS_PER_QUESTION;
}

/**
 * Converte uma questao da fonte em questao de tela, aplicando a distribuicao.
 *
 * @param question questao verbatim da fonte
 * @param questionIndex posicao da questao dentro do exercicio (0-based)
 */
export function distributeQuestion(
  question: SourceQuestion,
  questionIndex: number
): ExerciseQuestion {
  const targetPosition = targetCorrectPosition(questionIndex);
  const ordered = moveItem(question.options, question.correctSourceIndex, targetPosition);

  const options: ExerciseOption[] = ordered.map((text, position) => ({
    letter: OPTION_LETTERS[position],
    text,
  }));

  return {
    id: question.id,
    prompt: question.prompt,
    options,
    correctLetter: OPTION_LETTERS[targetPosition],
  };
}

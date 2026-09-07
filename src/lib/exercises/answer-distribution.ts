/**
 * Distribuicao das letras da alternativa correta.
 *
 * A fonte (corgly-classes/rules/09-secao6-multipla-escolha.md) registra, sobre
 * o gerador de DOCX:
 *
 *   "Quando todas as respostas ficam concentradas numa posicao, o gerador move
 *    a alternativa correta e distribui as letras em ciclo a, b, c, d, sem
 *    alterar o JSON de origem."
 *
 * A aula 1 e legada (sem o campo `correta`), entao a correta e sempre a
 * primeira alternativa no JSON. Renderizar nessa ordem entregaria oito questoes
 * com gabarito "a" — o aluno acerta tudo sem ler.
 *
 * Este modulo NAO reproduz o gerador de DOCX: ele resolve o mesmo problema com
 * outro criterio, de proposito. Diferencas que valem estar escritas:
 *
 *  - o gerador so redistribui quando detecta concentracao; aqui a posicao e
 *    sempre derivada, questao a questao, sem inspecionar o conjunto;
 *  - o gerador percorre o ciclo a, b, c, d na ordem do documento. Um ciclo puro
 *    e memorizavel: com oito questoes o aluno atento le "a, b, c, d, a, b, c, d"
 *    e acerta a segunda metade da prova sem ler os enunciados. Aqui a posicao
 *    sai de um hash do `id` da questao, que e estavel mas nao tem padrao visivel;
 *  - o gerador escreve no DOCX; aqui a fonte nunca e alterada, so a projecao de
 *    tela.
 *
 * O que as duas pontas tem em comum, e e o que importa para o aluno: a
 * alternativa correta muda de letra entre questoes e as outras tres alternativas
 * mantem a ordem relativa da fonte (ver `moveItem`).
 *
 * Deterministico de proposito: nada de `Math.random()`. A ordem precisa ser
 * identica no servidor e no cliente (senao o React acusa hydration mismatch) e
 * identica entre recarregamentos, para o aluno poder conferir a mesma prova com
 * outra pessoa.
 *
 * Contrapartida assumida do hash: ele nao garante distribuicao uniforme das
 * quatro letras dentro de uma aula, coisa que o ciclo garantia. Uniformidade
 * perfeita e justamente o que torna o ciclo previsivel; para a aula 1 o hash cai
 * em duas questoes por letra, e um desvio maior numa aula futura e aceitavel.
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

/**
 * FNV-1a de 32 bits seguido do finalizador de avalanche (variante do murmur3).
 *
 * O FNV-1a sozinho nao serve aqui: ids sequenciais (`aula-1-q1`..`aula-1-q8`)
 * diferem num unico caractere final, e os bits baixos do FNV-1a acompanham essa
 * diferenca de forma linear — `hash % 4` voltaria a desenhar um ciclo, so que
 * de tras para frente. O passo de avalanche espalha os bits altos sobre os
 * baixos e mata esse padrao.
 *
 * Aritmetica em 32 bits sem sinal (`Math.imul` + `>>> 0`) para o resultado ser
 * identico no Node do servidor e no motor JS do navegador.
 */
function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b) >>> 0;
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * Posicao que a alternativa correta ocupa na questao.
 *
 * Deriva do `id` da questao, e nao da posicao dela no exercicio: o id e estavel
 * (o catalogo exige que seja unico dentro da aula) e nao tem relacao visivel com
 * a ordem de exibicao, entao reordenar as questoes ou inserir uma no meio nao
 * embaralha o gabarito das outras.
 *
 * O enunciado NAO entra no hash de proposito: corrigir uma virgula no texto
 * moveria a resposta certa de lugar, e a aula 1 e material que o professor
 * revisa em ciclo.
 */
export function targetCorrectPosition(question: SourceQuestion): number {
  return hash32(question.id) % OPTIONS_PER_QUESTION;
}

/**
 * Converte uma questao da fonte em questao de tela, aplicando a distribuicao.
 *
 * @param question questao verbatim da fonte
 */
export function distributeQuestion(question: SourceQuestion): ExerciseQuestion {
  const targetPosition = targetCorrectPosition(question);
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

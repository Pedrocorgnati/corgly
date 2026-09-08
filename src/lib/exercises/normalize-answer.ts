/**
 * Normalizacao da resposta de texto do aluno.
 *
 * Existe UMA funcao de normalizacao no projeto e ela mora aqui. O gabarito de
 * `VERB_CLOZE` guarda `canonical` mais `accepted[]` como texto humano (com
 * acento, com maiuscula), e a resposta digitada chega crua. Comparar os dois
 * exige colapsar as diferencas que nao sao erro de conjugacao: espaco de sobra,
 * caixa e pontuacao. Acento e o unico eixo opcional, porque ele PODE ser erro:
 * quem escreve "voce esta" em vez de "você está" errou a ortografia, e so o
 * item decide se aquilo conta (`ExerciseItem.acceptWithoutAccent`).
 *
 * Ordem fixa: trim -> minusculas -> remove pontuacao -> (opcional) remove
 * acento -> colapsa espaco interno. Trocar a ordem muda o resultado: remover
 * pontuacao antes de colapsar espaco e o que faz "voce , esta" virar
 * "voce esta" em vez de "voce  esta".
 */

/** Pontuacao descartada na comparacao. Apostrofo entra: "d'agua" e "dagua" sao o mesmo erro ou o mesmo acerto. */
const PUNCTUATION_RE = /[.,;:!?¡¿"'`´^~()\[\]{}<>/\\|@#$%&*_+=–—-]/g;

/** Marcas de combinacao Unicode, o que sobra do `normalize('NFD')` depois da letra base. */
const DIACRITIC_RE = /[\u0300-\u036f]/g;

const WHITESPACE_RE = /\s+/g;

export interface NormalizeAnswerOptions {
  /** Quando `true`, "está" e "esta" passam a ser a mesma string. */
  acceptWithoutAccent: boolean;
}

/**
 * Reduz `raw` a forma comparavel.
 *
 * Nao lanca: entrada vazia devolve string vazia, e a decisao de tratar vazio
 * como errado e de quem compara, nao daqui.
 */
export function normalizeAnswer(raw: string, opts: NormalizeAnswerOptions): string {
  let value = raw.trim().toLowerCase();
  value = value.replace(PUNCTUATION_RE, ' ');

  if (opts.acceptWithoutAccent) {
    value = value.normalize('NFD').replace(DIACRITIC_RE, '').normalize('NFC');
  }

  return value.replace(WHITESPACE_RE, ' ').trim();
}

/** Gabarito de texto: uma forma canonica mais variantes igualmente corretas. */
export interface TextAnswerKey {
  canonical: string;
  accepted?: string[];
}

/**
 * `true` quando `raw` bate com a forma canonica OU com qualquer variante de
 * `accepted`, ambas normalizadas com as MESMAS opcoes. Normalizar so um lado
 * seria comparar mundos diferentes.
 */
export function matchesAnswerKey(
  raw: string,
  key: TextAnswerKey,
  opts: NormalizeAnswerOptions,
): boolean {
  const candidate = normalizeAnswer(raw, opts);
  if (candidate.length === 0) return false;

  if (candidate === normalizeAnswer(key.canonical, opts)) return true;

  return (key.accepted ?? []).some((variant) => normalizeAnswer(variant, opts) === candidate);
}

/**
 * Ponte entre os locales da interface (4) e os idiomas do conteudo da aula (3).
 *
 * O corgly-saas fala pt-BR, en-US, es-ES e it-IT. A fonte do curso publica cada
 * aula em pt, en e es — nao existe versao italiana. O fallback e explicito e
 * documentado aqui em vez de espalhado pelos componentes: it-IT le a versao em
 * ingles, que e a lingua-ponte do curso para quem nao fala portugues.
 *
 * Quando a fonte passar a publicar em italiano, este arquivo e o unico lugar a
 * mudar.
 */

import type { LessonContentLocale, LessonText } from './types';

/** Locale da interface -> idioma do conteudo da aula. */
const UI_LOCALE_TO_CONTENT: Record<string, LessonContentLocale> = {
  'pt-BR': 'pt',
  'en-US': 'en',
  'es-ES': 'es',
  // A fonte nao publica italiano: o aluno italiano le a versao em ingles.
  'it-IT': 'en',
};

/** Idioma usado quando o locale nao e reconhecido. */
const FALLBACK_CONTENT_LOCALE: LessonContentLocale = 'en';

/** Idioma do conteudo correspondente a um locale da interface. */
export function contentLocaleFor(uiLocale: string): LessonContentLocale {
  return UI_LOCALE_TO_CONTENT[uiLocale] ?? FALLBACK_CONTENT_LOCALE;
}

/** Texto da aula no idioma correspondente ao locale da interface. */
export function resolveLessonText(text: LessonText, uiLocale: string): string {
  return text[contentLocaleFor(uiLocale)];
}

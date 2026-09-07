import { describe, it, expect } from 'vitest';
import { fixtureScan } from './_message-scan';

/**
 * Guarda de fixture: cruza o que um TESTE publica em `messages={...}` com o que
 * o componente sob teste realmente pede ao next-intl.
 *
 * Por que ela existe: `consumed-keys.test.ts` cruza `src/` (sem `__tests__/`)
 * contra `i18n/messages/*.json` e estava certo no eixo dele. So que um teste que
 * escreve o proprio objeto `messages` a mao cria um SEGUNDO catalogo, invisivel
 * naquele eixo. Quando esse catalogo de mentira perde uma chave, o next-intl
 * emite `IntlError: MISSING_MESSAGE` no stderr, `t()` devolve o caminho cru como
 * texto e o teste continua VERDE — foi exatamente assim que
 * `cookieBanner.manage_preferences` e `onboarding.later` apareceram quebrados em
 * runtime de teste com a guarda antiga verde. O buraco nao era regex nem
 * namespace nao concatenado: era a linha `IGNORED_DIRS` da varredura, que nunca
 * le arquivo de teste. Esta guarda le.
 *
 * Tres defeitos que ela pega:
 *  1. fixture que OMITE chave consumida (o MISSING_MESSAGE silencioso);
 *  2. fixture que INVENTA chave que o catalogo real nao publica (o teste passa a
 *     testar copy que nenhum usuario vai ver);
 *  3. fixture que a varredura nao consegue resolver (ponto cego novo).
 *
 * O caminho certo, e o que a maioria dos testes ja faz, e importar o catalogo
 * real (`import ptBR from '../../../../i18n/messages/pt-BR.json'`) em vez de
 * escrever `messages` a mao. Fixture a mao so se sustenta enquanto publicar tudo
 * o que o componente pede.
 */

/**
 * DIVIDA REGISTRADA — nao e silenciador, e catraca.
 *
 * Cada entrada e um fixture a mao que hoje omite chave consumida. O registro e
 * casado por igualdade exata: a guarda fica VERMELHA se a lista crescer, se um
 * arquivo novo entrar, E TAMBEM se o arquivo for consertado sem que a entrada
 * saia daqui. Nao da para deixar apodrecer.
 *
 * Hoje esta VAZIO, e esse e o estado correto: `onboarding-slides.test.tsx`, a
 * unica entrada que existiu (publicava `onboarding` sem `completing` e sem
 * `later`, duas chaves que os quatro catalogos reais tem), passou a renderizar
 * com `import ptBR from '../../../../i18n/messages/pt-BR.json'` e saiu daqui.
 * Fixture novo a mao que omitir chave consumida entra vermelho; o conserto e o
 * mesmo — importar o catalogo real, nao registrar a divida aqui.
 */
const DIVIDA_DE_FIXTURE: Record<string, string[]> = {};

const COMO_CONSERTAR =
  'Conserto: importe o catalogo real em vez de escrever `messages` a mao ' +
  '(`import ptBR from \'../../../../i18n/messages/pt-BR.json\'`), ou publique no ' +
  'fixture toda chave que o componente pede.';

describe('i18n: catalogo de teste cobre o que o componente consome', () => {
  it('enxerga os provedores de i18n dos testes (a varredura nao pode sair vazia)', () => {
    const total =
      fixtureScan.handWritten.length + fixtureScan.catalogBacked.length + fixtureScan.derived.length;
    expect(total, 'nenhum NextIntlClientProvider encontrado: a varredura quebrou').toBeGreaterThan(10);
    expect(
      fixtureScan.catalogBacked.length,
      'nenhum teste renderizando com catalogo real: a varredura quebrou',
    ).toBeGreaterThan(5);
  });

  it('nenhum fixture inventa chave que o catalogo real nao publica', () => {
    const inventores = fixtureScan.handWritten
      .filter((finding) => finding.inventedKeys.length > 0)
      .map((finding) => `- ${finding.file}:${finding.line}  ${finding.inventedKeys.join(', ')}`);

    expect(
      inventores,
      inventores.length
        ? `\nFixture testando copy que nao existe em i18n/messages/:\n${inventores.join('\n')}\n`
        : undefined,
    ).toEqual([]);
  });

  it('nenhum fixture esconde chave que o componente sob teste consome', () => {
    const naoRegistrados = fixtureScan.handWritten
      .filter((finding) => {
        const divida = DIVIDA_DE_FIXTURE[finding.file] ?? [];
        return finding.missingKeys.some((key) => !divida.includes(key));
      })
      .map((finding) => {
        const divida = DIVIDA_DE_FIXTURE[finding.file] ?? [];
        const novas = finding.missingKeys.filter((key) => !divida.includes(key));
        return `- ${finding.file}:${finding.line}  fixture \`${finding.variable}\` publica [${finding.namespaces.join(', ')}] e NAO publica: ${novas.join(', ')}`;
      });

    expect(
      naoRegistrados,
      naoRegistrados.length
        ? `\nMISSING_MESSAGE silencioso em ${naoRegistrados.length} fixture(s):\n${naoRegistrados.join('\n')}\n\n${COMO_CONSERTAR}\n`
        : undefined,
    ).toEqual([]);
  });

  it('o registro de divida bate exatamente com a realidade medida', () => {
    const medido: Record<string, string[]> = {};
    for (const finding of fixtureScan.handWritten) {
      if (finding.missingKeys.length > 0) medido[finding.file] = [...finding.missingKeys].sort();
    }
    const registrado: Record<string, string[]> = {};
    for (const [file, keys] of Object.entries(DIVIDA_DE_FIXTURE)) registrado[file] = [...keys].sort();

    // Igualdade exata nos dois sentidos: entrada que sobra e divida ja paga e
    // nao removida; entrada que falta e divida nova entrando de fininho.
    expect(
      medido,
      'O registro DIVIDA_DE_FIXTURE divergiu da realidade. Se o fixture foi consertado, APAGUE a entrada; se apodreceu mais, conserte o fixture — nao atualize o registro para caber no defeito.',
    ).toEqual(registrado);
  });

  it('a varredura resolve todo fixture que encontra (zero ponto cego)', () => {
    const cegos = fixtureScan.derived.map((site) => `- ${site.file}:${site.line}  ${site.detail}`);

    expect(
      cegos,
      cegos.length
        ? `\nFixture que a varredura nao consegue resolver estaticamente — e o mesmo tipo de ponto cego que deixou o MISSING_MESSAGE passar:\n${cegos.join('\n')}\n`
        : undefined,
    ).toEqual([]);
  });
});

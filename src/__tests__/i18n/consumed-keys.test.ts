import { describe, it, expect } from 'vitest';
import { consumerScan, formatSites } from './_message-scan';

/**
 * Guarda de consumo: cruza as chaves que o codigo de `src/` realmente pede ao
 * next-intl com o que os catalogos de `i18n/messages/` publicam.
 *
 * Motivacao: `locale-parity.test.ts` compara os quatro arquivos ENTRE SI. Uma
 * chave consumida por `t()` e ausente nos quatro passa verde por la (nao ha
 * divergencia entre locales quando ninguem tem a chave) e explode em runtime
 * como `MISSING_MESSAGE`. Esta guarda fecha esse buraco: le os consumidores.
 *
 * Escopo: eixo CODIGO x CATALOGO REAL. O eixo CODIGO x CATALOGO DE TESTE (o
 * objeto `messages` que um teste escreve a mao e passa para
 * `NextIntlClientProvider`) e coberto por `message-fixtures.test.ts` — esta
 * guarda nao ve `src/__tests__/`, e por isso um fixture incompleto passava por
 * ela sem ruido. A varredura compartilhada vive em `_message-scan.ts`.
 *
 * Contrato de veredito (quatro niveis, deliberados):
 *
 *  - RESOLVIDA POR POOL LOCAL (falha se ausente): chave literal (`t('cta')`) ou
 *    chave montada a partir de um pool literal declarado NO MESMO ARQUIVO
 *    (`FAQ_KEYS.map((key) => t(`items.${key}.q`))`). A evidencia e local e
 *    completa, entao ausencia e defeito.
 *  - RESOLVIDA POR IMPORT DIRETO (falha se ausente): o pool vive em outro
 *    arquivo, mas o consumidor o IMPORTA estaticamente e ele e o unico pool
 *    entre os imports com aquela propriedade — caso de `labelKey` vindo de
 *    `src/lib/navigation/*.ts` para os drawers e sidebars. A aresta entre os
 *    dois arquivos e real, entao a evidencia vale tanto quanto a local e uma
 *    chave de navegacao que suma do catalogo REPROVA a suite.
 *  - INDICE GLOBAL (nunca falha): o pool nao esta nos imports do consumidor e
 *    so foi encontrado pelo indice de nomes de propriedade do repo inteiro (ou
 *    ha varios pools locais ambiguos com o mesmo nome). A evidencia e
 *    circunstancial — o mesmo nome de propriedade pode existir em outro
 *    contexto — entao a varredura reporta e nao acusa.
 *  - NAO VERIFICAVEL (nunca falha, sempre listada): tudo que a varredura nao
 *    consegue resolver estaticamente. E LISTADA no output do teste, com prefixo
 *    e candidatos quando existem, porque silencio aqui recria o buraco que esta
 *    guarda existe para fechar.
 */

describe('i18n: chaves consumidas pelo codigo existem no catalogo', () => {
  it('varre consumidores reais em src/ (a varredura nao pode sair vazia)', () => {
    expect(consumerScan.sourceFileCount).toBeGreaterThan(100);
    expect(
      consumerScan.literalCount,
      'nenhuma chave literal encontrada: a varredura quebrou',
    ).toBeGreaterThan(150);
  });

  it('nao consome chave ausente dos catalogos', () => {
    const { missing } = consumerScan;
    expect(
      missing,
      missing.length
        ? `\n${missing.length} chave(s) consumida(s) e AUSENTE(S) em pelo menos um locale:\n${formatSites(missing)}\n`
        : undefined,
    ).toEqual([]);
  });

  it('lista as chaves dinamicas que a varredura nao consegue verificar', () => {
    // Este teste nao falha por design: ele PUBLICA o ponto cego. O que ele
    // proibe e a lista sumir sem que a varredura tenha melhorado — chave
    // dinamica ignorada em silencio e exatamente o buraco original.
    const { resolvedDynamic, importResolved, externallyResolved, unverifiable } = consumerScan;
    const report = [
      `resolvidas por pool local (estrito): ${resolvedDynamic.length}`,
      `resolvidas por import direto (estrito): ${importResolved.length}`,
      `resolvidas por pool externo (evidencia circunstancial): ${externallyResolved.length}`,
      `NAO VERIFICAVEIS: ${unverifiable.length}`,
      importResolved.length ? `\n[import direto]\n${formatSites(importResolved)}` : '',
      externallyResolved.length ? `\n[pool externo]\n${formatSites(externallyResolved)}` : '',
      unverifiable.length ? `\n[nao verificavel]\n${formatSites(unverifiable)}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    console.info(`\n[i18n] varredura de consumidores\n${report}\n`);
    expect(
      resolvedDynamic.length + importResolved.length + externallyResolved.length + unverifiable.length,
    ).toBeGreaterThan(0);
  });
});

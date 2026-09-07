import fs from 'fs';
import path from 'path';
import { locales } from '../../../i18n/config';

/**
 * Varredura estatica de i18n compartilhada pelas guardas de `src/__tests__/i18n/`.
 *
 * Este modulo NAO contem testes: ele expoe a leitura dos catalogos, a varredura
 * dos consumidores de `src/` e a varredura dos fixtures de mensagem usados pelos
 * testes. Vive aqui (e nao em `src/lib/`) porque e infraestrutura de teste — o
 * bundle de producao nunca o importa.
 *
 * Duas guardas o consomem:
 *  - `consumed-keys.test.ts`  — o codigo de producao pede chave que o catalogo
 *    publica? (eixo CODIGO x CATALOGO REAL)
 *  - `message-fixtures.test.ts` — o catalogo de mentira que um teste passa para
 *    `NextIntlClientProvider` cobre o que o componente sob teste pede? (eixo
 *    CODIGO x CATALOGO DE TESTE)
 */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export const REPO_ROOT = process.cwd();
export const MESSAGES_DIR = path.join(REPO_ROOT, 'i18n/messages');
export const SRC_DIR = path.join(REPO_ROOT, 'src');

/** Diretorios que nao sao codigo de producao (teste, mock, dependencia). */
const IGNORED_DIRS = new Set(['node_modules', '__tests__', '__mocks__', 'test']);

function readCatalog(locale: string): Json {
  return JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), 'utf-8')) as Json;
}

export const catalogs = new Map<string, Json>(locales.map((locale) => [locale, readCatalog(locale)]));

/** Resolve `a.b.c` (e `a.b[0]`) dentro do catalogo; `undefined` = inexistente. */
export function resolveKey(root: Json, key: string): Json | undefined {
  const segments = key
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter((segment) => segment.length > 0);
  let node: Json | undefined = root;
  for (const segment of segments) {
    if (node === null || typeof node !== 'object') return undefined;
    node = Array.isArray(node)
      ? (node[Number(segment)] as Json | undefined)
      : (node as { [key: string]: Json })[segment];
    if (node === undefined) return undefined;
  }
  return node;
}

/** Chave util so se existir nos QUATRO locales (parity cobre o resto). */
export function existsInAllLocales(key: string): boolean {
  return locales.every((locale) => resolveKey(catalogs.get(locale)!, key) !== undefined);
}

function fullKey(namespace: string, key: string): string {
  return namespace ? `${namespace}.${key}` : key;
}

/** Um namespace do arquivo que resolva a chave ja basta (o arquivo escolhe qual `t` usa). */
function resolvedBy(namespaces: string[], key: string): string | null {
  for (const namespace of namespaces) {
    if (existsInAllLocales(fullKey(namespace, key))) return namespace;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Varredura de arquivos
// ---------------------------------------------------------------------------

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      listSourceFiles(path.join(dir, entry.name), out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) continue;
    out.push(path.join(dir, entry.name));
  }
  return out;
}

export const sourceFiles = listSourceFiles(SRC_DIR).sort();

/**
 * Apaga comentarios preservando as quebras de linha (o relatorio aponta linha).
 * Sem isso, JSDoc como `Plano vindo da landing (\`?plan=\`)` vira "chave
 * consumida" e a guarda acusa o que ninguem consome.
 */
export function stripComments(source: string): string {
  let out = '';
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    const next = source[i + 1];
    if (char === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      out += '\n';
      continue;
    }
    if (char === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      i += 1;
      out += '  ';
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      out += char;
      i += 1;
      while (i < source.length && source[i] !== char) {
        if (source[i] === '\\') {
          out += source[i];
          i += 1;
          if (i < source.length) out += source[i];
          i += 1;
          continue;
        }
        out += source[i];
        i += 1;
      }
      out += char ?? '';
      continue;
    }
    out += char;
  }
  return out;
}

export const sources = new Map<string, string>(
  sourceFiles.map((file) => [file, stripComments(fs.readFileSync(file, 'utf-8'))]),
);

// ---------------------------------------------------------------------------
// Pools literais
// ---------------------------------------------------------------------------

interface Pool {
  /** Literais soltos: `['a', 'b']`. */
  values: string[];
  /** Literais por nome de propriedade: `[{ key: 'a' }, { key: 'b' }]`. */
  props: Map<string, string[]>;
}

function emptyPool(): Pool {
  return { values: [], props: new Map() };
}

/** Fecha o delimitador aberto em `openIndex`, respeitando strings e aninhamento. */
function matchDelimiter(source: string, openIndex: number): number {
  const open = source[openIndex];
  const close = open === '[' ? ']' : open === '{' ? '}' : ')';
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    if (char === "'" || char === '"' || char === '`') {
      i += 1;
      while (i < source.length && source[i] !== char) {
        if (source[i] === '\\') i += 1;
        i += 1;
      }
      continue;
    }
    if (char === '[' || char === '{' || char === '(') depth += 1;
    else if (char === ']' || char === '}' || char === ')') {
      depth -= 1;
      if (depth === 0) return source[i] === close ? i : -1;
    }
  }
  return -1;
}

const STRING_LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;
const PROP_LITERAL = /([A-Za-z_$][\w$]*)\s*:\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")/g;

function poolFromBody(body: string): Pool {
  const pool = emptyPool();
  const consumed = new Set<number>();

  for (const match of body.matchAll(PROP_LITERAL)) {
    const name = match[1]!;
    const value = match[2] ?? match[3] ?? '';
    const bucket = pool.props.get(name) ?? [];
    if (!bucket.includes(value)) bucket.push(value);
    pool.props.set(name, bucket);
    // Posicao do literal dentro do match, para nao recontar abaixo.
    consumed.add(match.index + match[0].lastIndexOf(value === '' ? "'" : value));
  }

  for (const match of body.matchAll(STRING_LITERAL)) {
    const value = match[1] ?? match[2] ?? '';
    if (consumed.has(match.index + 1)) continue;
    if (!pool.values.includes(value)) pool.values.push(value);
  }

  return pool;
}

/** Todo literal do pool, venha ele solto ou como valor de propriedade. */
function allValues(pool: Pool): string[] {
  const out = [...pool.values];
  for (const bucket of pool.props.values()) {
    for (const value of bucket) if (!out.includes(value)) out.push(value);
  }
  return out;
}

/** `const NAME = [...]` / `const NAME = {...}` declarados no arquivo. */
function collectPools(source: string): Map<string, Pool> {
  const pools = new Map<string, Pool>();
  const declaration = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]{0,300}?)?=\s*([[{])/g;
  for (const match of source.matchAll(declaration)) {
    const name = match[1]!;
    const openIndex = match.index + match[0].length - 1;
    const closeIndex = matchDelimiter(source, openIndex);
    if (closeIndex < 0) continue;
    const pool = poolFromBody(source.slice(openIndex + 1, closeIndex));
    if (pool.values.length || pool.props.size) pools.set(name, pool);
  }
  return pools;
}

const poolCache = new Map<string, Map<string, Pool>>();
function poolsOf(file: string): Map<string, Pool> {
  const cached = poolCache.get(file);
  if (cached) return cached;
  const pools = collectPools(sources.get(file) ?? '');
  poolCache.set(file, pools);
  return pools;
}

/** Resolve `@/lib/x` e `./x` para um arquivo real de `src/`. */
export function resolveImport(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) base = path.join(SRC_DIR, specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(fromFile), specifier);
  else return null;
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]) {
    if (sources.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Arquivos de `src/` que ESTE arquivo importa estaticamente.
 *
 * Aceita aspa simples E dupla de proposito: o repo tem componentes escritos no
 * estilo shadcn (`import ... from "@/lib/constants/enums"`), e uma versao
 * anterior desta funcao so casava aspa simples. O efeito era silencioso e feio:
 * `session-card.tsx` caia no balde "NAO VERIFICAVEL" porque o scanner nao
 * enxergava a aresta ate o mapa de rotulos, e uma chave removida do catalogo
 * passaria verde ali.
 */
function importedFiles(file: string): string[] {
  const source = sources.get(file) ?? '';
  const found: string[] = [];
  for (const match of source.matchAll(/from\s+(?:'([^']+)'|"([^"]+)")/g)) {
    const specifier = match[1] ?? match[2];
    if (!specifier) continue;
    const resolved = resolveImport(file, specifier);
    if (resolved && !found.includes(resolved)) found.push(resolved);
  }
  return found;
}

/**
 * Indice global `nomeDaPropriedade -> literais`, ultimo recurso para pools que
 * nem o import direto alcanca. Evidencia circunstancial: alimenta relatorio,
 * nunca falha.
 */
const globalPropIndex = new Map<string, Set<string>>();
for (const source of sources.values()) {
  for (const match of source.matchAll(PROP_LITERAL)) {
    const name = match[1]!;
    const value = match[2] ?? match[3] ?? '';
    const bucket = globalPropIndex.get(name) ?? new Set<string>();
    bucket.add(value);
    globalPropIndex.set(name, bucket);
  }
}

// ---------------------------------------------------------------------------
// Consumidores
// ---------------------------------------------------------------------------

const NAMESPACE_CALL =
  /(?:useTranslations|getTranslations)\s*\(\s*(?:'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`|\{[^}]*namespace\s*:\s*(?:'([^'\n]*)'|"([^"\n]*)")[^}]*\})?\s*\)/g;
const TRANSLATOR_DECL =
  /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*\(/g;
/** Helper local que repassa a chave: `const text = (key: string) => t.has(key) ? t(key) : ...`. */
const WRAPPER_DECL = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(\s*([A-Za-z_$][\w$]*)\s*:\s*string/g;

export interface Site {
  file: string;
  line: number;
  detail: string;
}

const missing: Site[] = [];
const resolvedDynamic: Site[] = [];
const importResolved: Site[] = [];
const externallyResolved: Site[] = [];
const unverifiable: Site[] = [];
let literalCount = 0;

/**
 * Forca da evidencia com que um pool de chaves foi atribuido a uma variavel.
 *
 * - `local`: o pool esta no mesmo arquivo do `t(...)`. Prova fechada.
 * - `importado`: o pool esta num arquivo que o consumidor importa
 *   estaticamente, e e o unico pool entre os imports com aquela propriedade.
 *   Existe uma aresta real entre os dois arquivos, entao vale como prova.
 * - `externo`: indice global do repo ou varios pools locais ambiguos. E
 *   correlacao, nao prova: dois arquivos sem relacao podem ter uma propriedade
 *   `labelKey` cada um, e o scanner nao sabe qual e o certo.
 *
 * `local` e `importado` sao ESTRITOS: chave ausente vira `missing` e reprova a
 * suite. `externo` nunca reprova, so aparece no relatorio.
 */
type PoolScope = 'local' | 'importado' | 'externo';

interface PoolHit {
  pool: string[];
  scope: PoolScope;
  origin?: string;
}

const STRICT_SCOPES: ReadonlySet<PoolScope> = new Set<PoolScope>(['local', 'importado']);

/** Escopos cuja evidencia autoriza reprovar a suite por chave ausente. */
function isStrict(scope: PoolScope): boolean {
  return STRICT_SCOPES.has(scope);
}

/** Balde de relatorio de cada escopo (usado so quando NENHUMA chave falta). */
function bucketFor(scope: PoolScope): Site[] {
  if (scope === 'local') return resolvedDynamic;
  if (scope === 'importado') return importResolved;
  return externallyResolved;
}

/** Rotulo humano da origem do pool, para o detalhe do relatorio. */
function originLabel(variable: string, hit: PoolHit): string {
  return hit.origin ? `pool ${variable} @ ${hit.origin}` : `pool ${variable}`;
}

/** Candidatos do catalogo que casam com `prefixo.*.sufixo` — evidencia, nao veredito. */
function catalogCandidates(namespaces: string[], template: string): number {
  const pattern = new RegExp(
    `^${template
      .split(/\$\{[^}]*\}/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^.]+')}$`,
  );
  let count = 0;
  const root = catalogs.get(locales[0]!)!;
  for (const namespace of namespaces) {
    const node = namespace ? resolveKey(root, namespace) : root;
    if (node === null || typeof node !== 'object' || Array.isArray(node)) continue;
    const walk = (current: Json, prefix: string): void => {
      if (current === null || typeof current !== 'object' || Array.isArray(current)) return;
      for (const [name, value] of Object.entries(current)) {
        const next = prefix ? `${prefix}.${name}` : name;
        if (pattern.test(next)) count += 1;
        walk(value, next);
      }
    };
    walk(node, '');
  }
  return count;
}

for (const file of sourceFiles) {
  const source = sources.get(file)!;
  if (!/useTranslations|getTranslations/.test(source)) continue;

  const namespaces = new Set<string>();
  for (const match of source.matchAll(NAMESPACE_CALL)) {
    namespaces.add(match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? '');
  }
  if (namespaces.size === 0) continue;
  const namespaceList = [...namespaces];

  const translators = new Set<string>();
  for (const match of source.matchAll(TRANSLATOR_DECL)) translators.add(match[1]!);
  // Componentes que declaram o tradutor via prop/parametro (`t` injetado) ainda
  // usam o nome convencional; a heuristica cobre `t`, `tNav`, `tPricing`.
  for (const match of source.matchAll(/\b(t|t[A-Z][\w$]*)\s*(?:\.(?:has|rich|raw|markup))?\s*\(/g)) {
    translators.add(match[1]!);
  }

  const wrapperParams = new Set<string>();
  for (const match of source.matchAll(WRAPPER_DECL)) {
    const name = match[1]!;
    const param = match[2]!;
    const body = source.slice(match.index, match.index + 400);
    const forwards = new RegExp(`\\b(?:${[...translators].join('|')})\\s*(?:\\.[\\w$]+)?\\s*\\(\\s*${param}\\b`);
    if (forwards.test(body)) {
      translators.add(name);
      wrapperParams.add(param);
    }
  }

  const pools = collectPools(source);
  const relative = path.relative(REPO_ROOT, file);
  const lines = source.split('\n');
  const seen = new Set<string>();

  const poolFor = (variable: string): PoolHit | null => {
    const direct = pools.get(variable);
    if (direct && direct.values.length) return { pool: direct.values, scope: 'local' };
    for (const [poolName, pool] of pools) {
      const byProp = pool.props.get(variable);
      const destructured = new RegExp(
        `\\b${poolName}\\b[^\\n]{0,80}?(?:\\.(?:map|forEach|flatMap|filter)\\s*\\(\\s*(?:async\\s*)?\\(?\\s*\\{[^}]*\\b${variable}\\b|for\\s*\\(\\s*const\\s*\\{[^}]*\\b${variable}\\b[^}]*\\}\\s*of)`,
      );
      if (byProp && byProp.length && destructured.test(source)) {
        return { pool: byProp, scope: 'local' };
      }
      const iterated = new RegExp(
        `\\b${poolName}\\b\\s*\\.(?:map|forEach|flatMap|filter)\\s*\\(\\s*(?:async\\s*)?\\(?\\s*${variable}\\b|for\\s*\\(\\s*const\\s+${variable}\\s+of\\s+${poolName}\\b`,
      );
      if (pool.values.length && iterated.test(source)) {
        return { pool: pool.values, scope: 'local' };
      }
    }
    // `type Status = 'success' | 'invalid' | ...` + `const status = parseStatus(...)`:
    // a evidencia (alias + assinatura da funcao) e local e fechada.
    const binding = source.match(
      new RegExp(`(?:const|let)\\s+${variable}\\s*(?::\\s*([A-Za-z_$][\\w$]*))?\\s*=\\s*(?:await\\s+)?(?:([A-Za-z_$][\\w$]*)\\s*\\()?`),
    );
    if (binding) {
      let typeName: string | null = binding[1] ?? null;
      if (!typeName && binding[2]) {
        const signature = source.match(
          new RegExp(`function\\s+${binding[2]}\\s*\\([^)]*\\)\\s*:\\s*([A-Za-z_$][\\w$]*)`),
        );
        typeName = signature?.[1] ?? null;
      }
      if (typeName) {
        const alias = source.match(new RegExp(`type\\s+${typeName}\\s*=\\s*([^;\\n]+(?:\\n\\s*\\|[^;\\n]+)*)`));
        const body = alias?.[1] ?? '';
        if (body && /^\s*'[^']*'(\s*\|\s*'[^']*')*\s*$/.test(body.replace(/\n/g, ' '))) {
          const union = [...body.matchAll(/'([^']*)'/g)].map((entry) => entry[1]!);
          if (union.length) return { pool: union, scope: 'local' };
        }
      }
    }

    // Destructuring que nao cita o pool (`navItems.map(({ labelKey }) => ...)`
    // com `navItems = getAdminNavItems('sidebar')`): se UM unico pool local tem
    // a propriedade, a evidencia ainda e local; se varios tem, vira externo.
    const destructuredAnywhere = new RegExp(
      `(?:\\.(?:map|forEach|flatMap|filter)\\s*\\(\\s*(?:async\\s*)?\\(?\\s*\\{[^}]*\\b${variable}\\b|for\\s*\\(\\s*const\\s*\\{[^}]*\\b${variable}\\b)`,
    );
    if (destructuredAnywhere.test(source)) {
      const candidates = [...pools.values()]
        .map((pool) => pool.props.get(variable))
        .filter((bucket): bucket is string[] => Boolean(bucket && bucket.length));
      if (candidates.length === 1) return { pool: candidates[0]!, scope: 'local' };
      if (candidates.length > 1) {
        return { pool: [...new Set(candidates.flat())], scope: 'externo', origin: 'pools locais ambiguos' };
      }
    }
    // Pool alcancado por IMPORT DIRETO do arquivo consumidor. A evidencia nao e
    // local, mas tambem nao e circunstancial: existe uma aresta estatica entre
    // os dois arquivos, e o pool encontrado e o unico com aquela propriedade
    // entre os imports. Isso e forte o bastante para ACUSAR chave ausente —
    // antes caia no mesmo balde do indice global e nunca falhava, entao uma
    // chave de navegacao removida do catalogo passaria verde aqui.
    for (const imported of importedFiles(file)) {
      for (const pool of poolsOf(imported).values()) {
        const byProp = pool.props.get(variable);
        if (byProp && byProp.length) {
          return { pool: byProp, scope: 'importado', origin: path.relative(REPO_ROOT, imported) };
        }
      }
    }
    const global = globalPropIndex.get(variable);
    if (global && global.size) return { pool: [...global], scope: 'externo', origin: 'indice global' };
    return null;
  };

  /**
   * Pool de um mapa indexado (`t(MAPA[chave])`), pelo NOME do mapa.
   *
   * O mapa pode morar no proprio arquivo (evidencia local) ou vir por import
   * direto — caso de tabela de rotulos que vive numa lib e e renderizada pela
   * pagina. Antes so o pool local era consultado e o mapa importado caia em
   * "expressao / NAO VERIFICAVEL": chave removida do catalogo passava verde.
   */
  const mapPoolFor = (mapName: string): PoolHit | null => {
    const direct = pools.get(mapName);
    if (direct) {
      const values = allValues(direct);
      if (values.length) return { pool: values, scope: 'local' };
    }
    for (const imported of importedFiles(file)) {
      const pool = poolsOf(imported).get(mapName);
      if (!pool) continue;
      const values = allValues(pool);
      if (values.length) {
        return { pool: values, scope: 'importado', origin: path.relative(REPO_ROOT, imported) };
      }
    }
    return null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const lineNumber = index + 1;
    for (const translator of translators) {
      const call = new RegExp(`\\b${translator}\\s*(?:\\.(?:has|rich|raw|markup))?\\s*\\(\\s*([^)]*)`, 'g');
      for (const match of line.matchAll(call)) {
        const argument = match[1]!.trim();
        const fingerprint = `${lineNumber}:${argument}`;
        if (!argument || seen.has(fingerprint)) continue;
        seen.add(fingerprint);

        const literal = argument.match(/^(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/);
        if (literal) {
          literalCount += 1;
          const key = literal[1] ?? literal[2] ?? '';
          if (!resolvedBy(namespaceList, key)) {
            missing.push({
              file: relative,
              line: lineNumber,
              detail: `${key} (namespace testado: ${namespaceList.map((ns) => ns || '<raiz>').join(' | ')})`,
            });
          }
          continue;
        }

        const template = argument.match(/^`([^`]*)`/);
        if (template) {
          const raw = template[1]!;
          const holes = [...raw.matchAll(/\$\{([^}]*)\}/g)];
          if (holes.length === 1) {
            // Primeiro identificador do buraco (`${key}` -> `key`,
            // `${item.key}` -> `item`). Sem a flag `s`, que exige ES2018 e o
            // tsconfig deste repo mira ES2017.
            const hole = holes[0]![1]!.trim();
            const variable = /[A-Za-z_$][\w$]*/.exec(hole)?.[0] ?? hole;
            const found = poolFor(variable);
            if (found) {
              const origin = originLabel(variable, found);
              const expanded = found.pool.map((value) => raw.replace(/\$\{[^}]*\}/, value));
              const absent = expanded.filter((key) => !resolvedBy(namespaceList, key));
              if (absent.length === 0) {
                bucketFor(found.scope).push({
                  file: relative,
                  line: lineNumber,
                  detail: `\`${raw}\` x${expanded.length} (${origin})`,
                });
                continue;
              }
              if (isStrict(found.scope) && absent.length < expanded.length) {
                missing.push({
                  file: relative,
                  line: lineNumber,
                  detail: `\`${raw}\` (${origin}) -> ausente(s): ${absent.join(', ')}`,
                });
                continue;
              }
              if (found.scope === 'externo') {
                unverifiable.push({
                  file: relative,
                  line: lineNumber,
                  detail: `\`${raw}\` (${origin} resolve so ${expanded.length - absent.length}/${expanded.length}; candidatos no catalogo: ${catalogCandidates(namespaceList, raw)})`,
                });
                continue;
              }
            }
          }
          unverifiable.push({
            file: relative,
            line: lineNumber,
            detail: `\`${raw}\` (candidatos no catalogo: ${catalogCandidates(namespaceList, raw)})`,
          });
          continue;
        }

        const identifier = argument.match(/^([A-Za-z_$][\w$]*)\s*(?:,|$)/);
        if (identifier) {
          const variable = identifier[1]!;
          if (wrapperParams.has(variable)) continue; // verificado nos call sites do helper
          const found = poolFor(variable);
          if (found) {
            const origin = originLabel(variable, found);
            const absent = found.pool.filter((key) => !resolvedBy(namespaceList, key));
            if (absent.length === 0) {
              bucketFor(found.scope).push({
                file: relative,
                line: lineNumber,
                detail: `${variable} x${found.pool.length} (${origin})`,
              });
              continue;
            }
            if (isStrict(found.scope) && absent.length < found.pool.length) {
              missing.push({ file: relative, line: lineNumber, detail: `${variable} (${origin}) -> ausente(s): ${absent.join(', ')}` });
              continue;
            }
            unverifiable.push({
              file: relative,
              line: lineNumber,
              detail: `${variable} (${origin} resolve so ${found.pool.length - absent.length}/${found.pool.length}; ausentes: ${absent.slice(0, 4).join(', ')})`,
            });
            continue;
          }
        }

        const indexed = argument.match(/^([A-Za-z_$][\w$]*)\s*\[/);
        if (indexed) {
          const mapName = indexed[1]!;
          const found = mapPoolFor(mapName);
          if (found && found.pool.length) {
            const candidates = found.pool;
            const origin = found.origin ? ` @ ${found.origin}` : '';
            const absent = candidates.filter((key) => !resolvedBy(namespaceList, key));
            if (absent.length === 0) {
              bucketFor(found.scope).push({
                file: relative,
                line: lineNumber,
                detail: `${mapName}[...] x${candidates.length}${origin}`,
              });
              continue;
            }
            missing.push({
              file: relative,
              line: lineNumber,
              detail: `${mapName}[...]${origin} -> ausente(s): ${absent.join(', ')}`,
            });
            continue;
          }
        }

        // `text(status.key)` com `STATUS_KEYS = { ACTIVE: { key: 'statusActive' } }`.
        const member = argument.match(/^[A-Za-z_$][\w$]*\??\.([A-Za-z_$][\w$]*)\s*(?:,|$)/);
        if (member) {
          const property = member[1]!;
          const buckets = [...pools.values()]
            .map((pool) => pool.props.get(property))
            .filter((bucket): bucket is string[] => Boolean(bucket && bucket.length));
          if (buckets.length === 1) {
            const candidates = buckets[0]!;
            const absent = candidates.filter((key) => !resolvedBy(namespaceList, key));
            if (absent.length === 0) {
              resolvedDynamic.push({ file: relative, line: lineNumber, detail: `${argument} x${candidates.length}` });
              continue;
            }
            missing.push({ file: relative, line: lineNumber, detail: `${argument} -> ausente(s): ${absent.join(', ')}` });
            continue;
          }
        }

        unverifiable.push({ file: relative, line: lineNumber, detail: `${argument.split(',')[0]} (expressao)` });
      }
    }
  }
}


/** Resultado da varredura CODIGO x CATALOGO REAL, consumido por `consumed-keys.test.ts`. */
export const consumerScan = {
  missing,
  resolvedDynamic,
  importResolved,
  externallyResolved,
  unverifiable,
  literalCount,
  sourceFileCount: sourceFiles.length,
};

export function formatSites(sites: Site[]): string {
  return sites.map((site) => `  - ${site.file}:${site.line}  ${site.detail}`).join('\n');
}

// ---------------------------------------------------------------------------
// Eixo CODIGO x CATALOGO DE TESTE (fixtures de `NextIntlClientProvider`)
// ---------------------------------------------------------------------------
//
// Um teste que passa um objeto `messages` escrito a mao para
// `NextIntlClientProvider` cria um SEGUNDO catalogo, invisivel para a guarda de
// consumo (que so cruza `src/` com `i18n/messages/*.json`). Se esse catalogo de
// mentira esquecer uma chave, o componente renderiza a string quebrada, o
// next-intl loga `MISSING_MESSAGE` no stderr e o teste passa mesmo assim —
// falso verde. Esta secao le os fixtures e cobra deles as chaves que o
// componente sob teste de fato pede.

const TESTS_DIR = path.join(SRC_DIR, '__tests__');

function listTestFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      listTestFiles(path.join(dir, entry.name), out);
      continue;
    }
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) out.push(path.join(dir, entry.name));
  }
  return out;
}

/** Quebra `a, b, c` no nivel zero de aninhamento, respeitando strings. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i]!;
    if (char === "'" || char === '"' || char === '`') {
      i += 1;
      while (i < body.length && body[i] !== char) {
        if (body[i] === '\\') i += 1;
        i += 1;
      }
      continue;
    }
    if (char === '[' || char === '{' || char === '(') depth += 1;
    else if (char === ']' || char === '}' || char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(body.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = body.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

/**
 * Caminhos-folha de um literal de objeto TS (`{ a: { b: 'x' }, c: ['y'] }` ->
 * `a.b`, `c.0`). O fixture e dado puro: string, objeto e array de string.
 */
function leafPathsOfObject(body: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of splitTopLevel(body)) {
    const head = /^(?:'([^']*)'|"([^"]*)"|([A-Za-z_$][\w$]*))\s*:\s*/.exec(entry);
    if (!head) continue;
    const name = head[1] ?? head[2] ?? head[3]!;
    const value = entry.slice(head[0].length).trim();
    const keyPath = prefix ? `${prefix}.${name}` : name;
    if (value.startsWith('{')) {
      out.push(...leafPathsOfObject(value.slice(1, -1), keyPath));
      continue;
    }
    if (value.startsWith('[')) {
      splitTopLevel(value.slice(1, -1)).forEach((item, index) => {
        if (item.startsWith('{')) out.push(...leafPathsOfObject(item.slice(1, -1), `${keyPath}.${index}`));
        else out.push(`${keyPath}.${index}`);
      });
      continue;
    }
    out.push(keyPath);
  }
  return out;
}

/** Namespaces e chaves LITERAIS que um arquivo de producao pede ao next-intl. */
function literalConsumptionOf(file: string): { namespaces: string[]; keys: string[] } {
  const source = sources.get(file);
  if (!source || !/useTranslations|getTranslations/.test(source)) return { namespaces: [], keys: [] };

  const namespaces = new Set<string>();
  for (const match of source.matchAll(NAMESPACE_CALL)) {
    namespaces.add(match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? '');
  }
  if (namespaces.size === 0) return { namespaces: [], keys: [] };

  const translators = new Set<string>();
  for (const match of source.matchAll(TRANSLATOR_DECL)) translators.add(match[1]!);
  for (const match of source.matchAll(/\b(t|t[A-Z][\w$]*)\s*(?:\.(?:has|rich|raw|markup))?\s*\(/g)) {
    translators.add(match[1]!);
  }

  const keys = new Set<string>();
  for (const translator of translators) {
    const call = new RegExp(
      `\\b${translator}\\s*(?:\\.(?:has|rich|raw|markup))?\\s*\\(\\s*(?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)")`,
      'g',
    );
    for (const match of source.matchAll(call)) keys.add(match[1] ?? match[2] ?? '');
  }
  return { namespaces: [...namespaces], keys: [...keys] };
}

/** Fecho transitivo de arquivos de producao alcancados por um teste, menos os mockados. */
function productionClosure(testFile: string, testSource: string): string[] {
  const mocked = new Set<string>();
  for (const match of testSource.matchAll(/vi\s*\.\s*mock\s*\(\s*'([^']+)'/g)) {
    const resolved = resolveImport(testFile, match[1]!);
    if (resolved) mocked.add(resolved);
  }

  const seen = new Set<string>();
  const queue: string[] = [];
  for (const match of testSource.matchAll(/from\s+'([^']+)'/g)) {
    const resolved = resolveImport(testFile, match[1]!);
    if (resolved && !mocked.has(resolved)) queue.push(resolved);
  }
  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file) || mocked.has(file)) continue;
    seen.add(file);
    for (const imported of importedFiles(file)) {
      if (!seen.has(imported) && !mocked.has(imported)) queue.push(imported);
    }
  }
  return [...seen];
}

export interface FixtureFinding {
  /** Caminho do teste, relativo ao repo. */
  file: string;
  line: number;
  /** Identificador passado em `messages={...}`. */
  variable: string;
  /** Namespaces que o fixture publica. */
  namespaces: string[];
  /** Chaves que o componente pede e o fixture NAO publica (`ns.key`). */
  missingKeys: string[];
  /** Chaves que o fixture publica e o catalogo real nao tem (`ns.key`). */
  inventedKeys: string[];
}

const handWritten: FixtureFinding[] = [];
const catalogBacked: Site[] = [];
const derivedFixtures: Site[] = [];

for (const testFile of listTestFiles(TESTS_DIR)) {
  const raw = fs.readFileSync(testFile, 'utf-8');
  if (!raw.includes('NextIntlClientProvider')) continue;
  const source = stripComments(raw);
  const relative = path.relative(REPO_ROOT, testFile);

  // Identificadores importados de `i18n/messages/*.json` sao o catalogo real.
  const fromCatalog = new Set<string>();
  for (const match of source.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+'([^']*i18n\/messages\/[^']+)'/g)) {
    fromCatalog.add(match[1]!);
  }

  const variables = new Set<string>();
  for (const match of source.matchAll(/messages=\{([A-Za-z_$][\w$]*)\}/g)) variables.add(match[1]!);

  const lines = source.split('\n');
  const lineOf = (needle: string): number => lines.findIndex((line) => line.includes(needle)) + 1;

  for (const variable of variables) {
    if (fromCatalog.has(variable)) {
      catalogBacked.push({ file: relative, line: lineOf(`messages={${variable}}`), detail: `${variable} (catalogo real)` });
      continue;
    }

    const declaration = new RegExp(`(?:const|let|var)\\s+${variable}\\s*(?::[^=\\n]{0,200})?=\\s*`);
    const found = declaration.exec(source);
    if (!found) {
      derivedFixtures.push({ file: relative, line: lineOf(`messages={${variable}}`), detail: `${variable} (declaracao nao encontrada)` });
      continue;
    }
    const valueStart = found.index + found[0].length;
    if (source[valueStart] !== '{') {
      // `const messages = locale === 'pt-BR' ? ptBR : en` — derivado do catalogo.
      const tail = source.slice(valueStart, valueStart + 200);
      const backed = [...fromCatalog].some((name) => new RegExp(`\\b${name}\\b`).test(tail));
      const site = { file: relative, line: lineOf(`messages={${variable}}`), detail: `${variable} = ${tail.split('\n')[0]!.trim()}` };
      if (backed) catalogBacked.push(site);
      else derivedFixtures.push(site);
      continue;
    }

    const closeIndex = matchDelimiter(source, valueStart);
    if (closeIndex < 0) {
      derivedFixtures.push({ file: relative, line: lineOf(`messages={${variable}}`), detail: `${variable} (literal nao fechado)` });
      continue;
    }
    const published = new Set(leafPathsOfObject(source.slice(valueStart + 1, closeIndex)));
    const stubbed = new Set([...published].map((leaf) => leaf.split('.')[0]!));

    const missingKeys: string[] = [];
    for (const production of productionClosure(testFile, source)) {
      const { namespaces, keys } = literalConsumptionOf(production);
      for (const namespace of namespaces) {
        if (!stubbed.has(namespace)) continue;
        for (const key of keys) {
          const full = fullKey(namespace, key);
          if (!published.has(full) && !missingKeys.includes(full)) missingKeys.push(full);
        }
      }
    }

    const inventedKeys = [...published].filter((leaf) => !existsInAllLocales(leaf)).sort();

    handWritten.push({
      file: relative,
      line: source.slice(0, found.index).split('\n').length,
      variable,
      namespaces: [...stubbed].sort(),
      missingKeys: missingKeys.sort(),
      inventedKeys,
    });
  }
}

/** Resultado da varredura CODIGO x CATALOGO DE TESTE, consumido por `message-fixtures.test.ts`. */
export const fixtureScan = {
  /** Fixtures escritos a mao — a classe que produz `MISSING_MESSAGE` em teste verde. */
  handWritten,
  /** Testes que renderizam com o catalogo real (o padrao correto). */
  catalogBacked,
  /** Fixtures que a varredura nao consegue resolver estaticamente. */
  derived: derivedFixtures,
};

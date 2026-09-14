/**
 * Contagem exata por tabela do banco de DATABASE_URL (GAP-01, loop 09-06, ST005).
 *
 * Uso: npx tsx scripts/ci/db-table-counts.ts [--slots-distinct] [--expect-db=<banco>]
 *   sem flag          imprime `tabela<TAB>contagem` de cada BASE TABLE do banco, ordenado por nome,
 *                     com COUNT(*) exato (nunca TABLE_ROWS, que no InnoDB e estimativa);
 *   --slots-distinct  imprime `total<TAB>distintos` de availability_slots.startAt;
 *   --expect-db=X     aborta com exit 4 se SELECT DATABASE() for diferente de X.
 *
 * Usa PrismaClient de @prisma/client direto (sem @/lib/prisma, que importa server-only).
 * Nunca imprime URL: erros saem em stderr com qualquer mysql://... trocado por mysql://***.
 * Exit: 0 ok; 1 erro de banco; 2 uso invalido ou DATABASE_URL ausente; 4 banco inesperado.
 */
import { PrismaClient } from '@prisma/client';

const FLAG_EXPECT = '--expect-db=';

function mascara(texto: string): string {
  return texto.replace(/mysql:\/\/\S*/g, 'mysql://***');
}

function porNome(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const slotsDistinct = args.includes('--slots-distinct');
  const expectArg = args.find((a) => a.startsWith(FLAG_EXPECT));
  const expectDb = expectArg === undefined ? undefined : expectArg.slice(FLAG_EXPECT.length);
  const invalidos = args.filter((a) => a !== '--slots-distinct' && !a.startsWith(FLAG_EXPECT));
  if (invalidos.length > 0) {
    process.stderr.write(`ERRO db-table-counts: argumento desconhecido: ${invalidos.join(' ')}\n`);
    return 2;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    process.stderr.write('ERRO db-table-counts: DATABASE_URL ausente\n');
    return 2;
  }

  const prisma = new PrismaClient({ datasources: { db: { url } }, log: ['error'] });
  try {
    const bancoRows = await prisma.$queryRawUnsafe<Array<{ banco: string | null }>>(
      'SELECT DATABASE() AS banco',
    );
    const banco = bancoRows[0]?.banco ?? null;
    if (expectDb !== undefined && banco !== expectDb) {
      process.stderr.write(
        `ABORTADO: alvo inesperado (banco ${banco ?? 'nenhum'}, esperado ${expectDb})\n`,
      );
      return 4;
    }

    if (slotsDistinct) {
      const rows = await prisma.$queryRawUnsafe<Array<{ total: unknown; distintos: unknown }>>(
        'SELECT COUNT(*) AS total, COUNT(DISTINCT `startAt`) AS distintos FROM `availability_slots`',
      );
      const linha = rows[0];
      if (!linha) throw new Error('availability_slots sem linha de contagem');
      process.stdout.write(`${Number(linha.total)}\t${Number(linha.distintos)}\n`);
      return 0;
    }

    const tabelas = await prisma.$queryRawUnsafe<Array<{ nome: string }>>(
      "SELECT TABLE_NAME AS nome FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'",
    );
    const nomes = tabelas.map((t) => String(t.nome)).sort(porNome);
    const linhas: string[] = [];
    for (const nome of nomes) {
      const ident = '`' + nome.replace(/`/g, '``') + '`';
      const rows = await prisma.$queryRawUnsafe<Array<{ n: unknown }>>(
        `SELECT COUNT(*) AS n FROM ${ident}`,
      );
      linhas.push(`${nome}\t${Number(rows[0]?.n ?? Number.NaN)}`);
    }
    if (linhas.length > 0) process.stdout.write(`${linhas.join('\n')}\n`);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((rc) => {
    process.exitCode = rc;
  })
  .catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`ERRO db-table-counts: ${mascara(msg)}\n`);
    process.exitCode = 1;
  });

#!/usr/bin/env bash
# Registro de prisma migrate status por ambiente (GAP-01, loop 09-06, ST007).
# Uso: bash scripts/ci/migrate-status-record.sh <dev|test|ci>
#   dev   roda npx prisma migrate status sem injetar URL (o Prisma CLI resolve a configuracao
#         local sozinho; este script nunca abre nem imprime .env*);
#   test  exige DATABASE_URL_TEST exportada no shell (mesmo requisito de
#         src/test/integration/setup.ts); ausente, imprime a linha SEM_ACESSO e sai 3;
#   ci    usa o DATABASE_URL exportado pelo orquestrador (scripts/ci/db-provisioning-run.sh).
# Imprime em stdout uma unica linha markdown:
#   | <ambiente> | <ISO UTC> | <sha7 do HEAD> | <banco>@<host:porta> | <N migrations found> | <estado> | <rc do prisma> |
# Estados: EM_DIA, PENDENTE, FALHA_DE_MIGRATION, DIVERGENTE, SEM_CONEXAO_P1000, SEM_CONEXAO_P1001,
# SEM_CONEXAO_P1002, SEM_CONEXAO_P1017, DESCONHECIDO, SEM_ACESSO e ALVO_NAO_LOCAL (dev ou test com
# host diferente de localhost, 127.0.0.1 ou db). Com REPORT_DIR exportado, grava a saida do Prisma
# (sem cor, URL mascarada) em REPORT_DIR/migrate-status-<ambiente>.log.
# Nunca imprime URL, usuario ou senha.
# Exit: 0 so EM_DIA; 1 outro estado; 2 uso invalido; 3 SEM_ACESSO; 4 ALVO_NAO_LOCAL.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1
export NO_COLOR=1

amb="${1:-}"
case "$amb" in
  dev|test|ci) ;;
  *) echo "uso: bash scripts/ci/migrate-status-record.sh <dev|test|ci>" >&2; exit 2 ;;
esac

agora="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
sha7="$(git rev-parse --short=7 HEAD 2>/dev/null || echo desconhecido)"

# linha <banco@host> <migrations> <estado> <rc>
linha() { printf '| %s | %s | %s | %s | %s | %s | %s |\n' "$amb" "$agora" "$sha7" "$1" "$2" "$3" "$4"; }

if [ "$amb" = test ] && [ -z "${DATABASE_URL_TEST:-}" ]; then
  linha "-" "-" SEM_ACESSO "-"
  echo "migrate-status-record: DATABASE_URL_TEST ausente no shell" >&2
  exit 3
fi
if [ "$amb" = ci ] && [ -z "${DATABASE_URL:-}" ]; then
  echo "migrate-status-record: DATABASE_URL ausente para o ambiente ci" >&2
  exit 2
fi

if [ "$amb" = test ]; then
  saida="$(DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate status 2>&1)"
  rc=$?
else
  saida="$(npx prisma migrate status 2>&1)"
  rc=$?
fi
saida="$(printf '%s\n' "$saida" | sed -E -e 's/\x1b\[[0-9;]*[A-Za-z]//g' -e 's#mysql://[^[:space:]]*#mysql://***#g')"
if [ -n "${REPORT_DIR:-}" ] && [ -d "$REPORT_DIR" ]; then
  printf '%s\n' "$saida" > "$REPORT_DIR/migrate-status-$amb.log"
fi

ds="$(printf '%s\n' "$saida" | grep -oE 'Datasource "db": MySQL database "[^"]*" at "[^"]*"' | head -n1)"
if [ -n "$ds" ]; then
  banco="$(printf '%s\n' "$ds" | sed -E 's/.*MySQL database "([^"]*)".*/\1/')"
  hostporta="$(printf '%s\n' "$ds" | sed -E 's/.* at "([^"]*)"$/\1/')"
  host="${hostporta%:*}"
  alvo="$banco@$hostporta"
else
  host=""
  alvo="-"
fi
n="$(printf '%s\n' "$saida" | grep -oE '^[0-9]+ migrations? found in prisma/migrations' | head -n1 | grep -oE '^[0-9]+')"
n="${n:--}"

if [ "$amb" != ci ] && [ -n "$host" ]; then
  case "$host" in
    localhost|127.0.0.1|db) ;;
    *) linha "$alvo" "$n" ALVO_NAO_LOCAL "$rc"; exit 4 ;;
  esac
fi

case "$saida" in
  *P1000*) estado=SEM_CONEXAO_P1000 ;;
  *P1001*) estado=SEM_CONEXAO_P1001 ;;
  *P1002*) estado=SEM_CONEXAO_P1002 ;;
  *P1017*) estado=SEM_CONEXAO_P1017 ;;
  *P3009*|*"migration failed"*|*"have failed"*) estado=FALHA_DE_MIGRATION ;;
  *diverge*|*"not managed by Prisma Migrate"*) estado=DIVERGENTE ;;
  *"have not yet been applied"*) estado=PENDENTE ;;
  *"Database schema is up to date!"*) estado=EM_DIA ;;
  *) estado=DESCONHECIDO ;;
esac
# EM_DIA exige tambem rc 0 do Prisma: a frase com rc diferente de 0 nao vale como sucesso.
if [ "$estado" = EM_DIA ] && [ "$rc" != 0 ]; then estado=DESCONHECIDO; fi

linha "$alvo" "$n" "$estado" "$rc"
[ "$estado" = EM_DIA ] && exit 0
exit 1

#!/usr/bin/env bash
# Migrations em banco MySQL vazio com diff zero contra schema.prisma (GAP-01, loop 09-06, ST003).
# Chamado por scripts/ci/db-provisioning-run.sh, que exporta DATABASE_URL (banco corgly_ci),
# SHADOW_DATABASE_URL (banco corgly_ci_shadow), REPORT_DIR, CI_DB_HOST e CI_DB_PORT.
# Grava REPORT_DIR/migrations.md (passo | resultado | rc) e um .log por comando.
# Nunca grava nem imprime URL de banco: a saida do Prisma passa por um filtro que troca
# qualquer mysql://... por mysql://*** antes de chegar ao disco.
# Exit: 0 todos os passos PASSOU; 1 algum passo FALHA; 2 entrada ausente; 4 alvo inesperado.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1
export NO_COLOR=1

if [ -z "${DATABASE_URL:-}" ] || [ -z "${SHADOW_DATABASE_URL:-}" ] || [ -z "${REPORT_DIR:-}" ]; then
  echo "ERRO: DATABASE_URL, SHADOW_DATABASE_URL e REPORT_DIR precisam estar exportadas" >&2
  exit 2
fi
HOST="${CI_DB_HOST:-127.0.0.1}"
PORT="${CI_DB_PORT:-3306}"
mkdir -p "$REPORT_DIR" || exit 2
MD="$REPORT_DIR/migrations.md"

falhas=0
linhas=()
detalhes=()

# roda <log> <comando...>: grava stdout+stderr sem cor e com URL mascarada em REPORT_DIR/<log>
# e devolve o rc do comando (nao o do filtro).
roda() {
  local log="$1"; shift
  "$@" 2>&1 | sed -E -e 's/\x1b\[[0-9;]*[A-Za-z]//g' -e 's#mysql://[^[:space:]]*#mysql://***#g' > "$REPORT_DIR/$log"
  return "${PIPESTATUS[0]}"
}

# registra <passo> <resultado> <rc> [detalhe]
registra() {
  linhas+=("| $1 | $2 | $3 |")
  [ -n "${4:-}" ] && detalhes+=("- $1: $4")
  echo "passo $1: $2 (rc=$3)"
  [ "$2" = PASSOU ] || falhas=$((falhas + 1))
}

escreve_md() {
  {
    echo "# migrations em banco vazio"
    echo
    echo "Gerado em $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "Alvo esperado: banco corgly_ci em $HOST:$PORT, shadow corgly_ci_shadow"
    echo
    echo "| passo | resultado | rc |"
    echo "|---|---|---|"
    printf '%s\n' "${linhas[@]}"
    if [ "${#detalhes[@]}" -gt 0 ]; then
      echo
      printf '%s\n' "${detalhes[@]}"
    fi
    echo
    echo "$1"
  } > "$MD"
}

# 1. Guard de alvo e banco vazio, pela mesma leitura de migrate status.
roda migrate-status-inicial.log npx prisma migrate status
rc_status_inicial=$?
esperado="Datasource \"db\": MySQL database \"corgly_ci\" at \"$HOST:$PORT\""
if ! grep -qF -- "$esperado" "$REPORT_DIR/migrate-status-inicial.log"; then
  registra guard_de_alvo FALHA 4 "linha Datasource diferente de corgly_ci em $HOST:$PORT"
  echo "ABORTADO: alvo inesperado"
  escreve_md "Resultado: ABORTADO: alvo inesperado"
  exit 4
fi
registra guard_de_alvo PASSOU 0

# Banco vazio: com migrations pendentes o Prisma sai 1 e imprime "have not yet been applied".
# Exige o rc e o texto; outro rc (2, 127...), erro de conexao ou P3005 reprova.
if [ "$rc_status_inicial" = 1 ] \
   && grep -qF 'have not yet been applied' "$REPORT_DIR/migrate-status-inicial.log" \
   && ! grep -qE 'P3005|not managed by Prisma Migrate|P1000|P1001|P1002|P1017' "$REPORT_DIR/migrate-status-inicial.log"; then
  registra banco_vazio PASSOU "$rc_status_inicial"
else
  registra banco_vazio FALHA "$rc_status_inicial" "migrate status inicial sem rc 1, sem 'have not yet been applied' ou com P3005/P1000/P1001/P1002/P1017"
  # Pre-condicao falhou: nenhuma etapa mutante roda depois dela.
  for p in migrate_deploy contagem_migrations migrate_status diff_from_url diff_from_migrations; do
    registra "$p" NAO_EXECUTADA -
  done
  escreve_md "Resultado: FALHA (banco_vazio; deploy e diffs nao executados)"
  exit 1
fi

# 2. Deploy de todas as migrations do disco.
roda migrate-deploy.log npx prisma migrate deploy
rc=$?
if [ "$rc" -eq 0 ]; then registra migrate_deploy PASSOU 0; else registra migrate_deploy FALHA "$rc"; fi

n_disco="$(ls -d prisma/migrations/*/ | wc -l | tr -d ' ')"
n_found="$(grep -oE '^[0-9]+ migrations? found in prisma/migrations' "$REPORT_DIR/migrate-deploy.log" | head -n1 | grep -oE '^[0-9]+')"
if [ -n "$n_found" ] && [ "$n_found" = "$n_disco" ]; then
  registra contagem_migrations PASSOU 0 "found=$n_found disco=$n_disco"
else
  registra contagem_migrations FALHA 1 "found=${n_found:-ausente} disco=$n_disco"
fi

# 3. Status depois do deploy.
roda migrate-status-final.log npx prisma migrate status
rc=$?
if [ "$rc" -eq 0 ] && grep -qF 'Database schema is up to date!' "$REPORT_DIR/migrate-status-final.log"; then
  registra migrate_status PASSOU 0
else
  registra migrate_status FALHA "$rc"
fi

# 4. Banco migrado contra schema.prisma. rc 0 = sem diferenca; 2 = drift; 1 = erro.
roda diff-from-url.log npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
rc=$?
case "$rc" in
  0) registra diff_from_url PASSOU 0 ;;
  2) roda diff-from-url.sql npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script
     registra diff_from_url FALHA 2 "drift entre o banco migrado e schema.prisma; SQL em diff-from-url.sql" ;;
  *) registra diff_from_url FALHA "$rc" "erro do prisma migrate diff; ver diff-from-url.log" ;;
esac

# 5. Pasta de migrations (replay na shadow) contra schema.prisma.
roda diff-from-migrations.log npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL" --exit-code
rc=$?
case "$rc" in
  0) registra diff_from_migrations PASSOU 0 ;;
  2) roda diff-from-migrations.sql npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL" --script
     registra diff_from_migrations FALHA 2 "drift entre prisma/migrations e schema.prisma; SQL em diff-from-migrations.sql" ;;
  *) registra diff_from_migrations FALHA "$rc" "erro do prisma migrate diff; ver diff-from-migrations.log" ;;
esac

if [ "$falhas" -eq 0 ]; then
  escreve_md "Resultado: PASSOU"
  exit 0
fi
escreve_md "Resultado: FALHA ($falhas passo(s))"
exit 1

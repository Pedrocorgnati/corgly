#!/usr/bin/env bash
# Orquestrador do job de provisionamento de banco (GAP-01, loop 09-06, ST003 a ST005 e ST007).
# Roda contra um MySQL descartavel ja iniciado (no CI, o container do workflow db-provisioning).
#
# Entradas (so por nome; a senha nunca e impressa nem gravada):
#   CI_DB_PASSWORD  obrigatoria, senha do root do MySQL descartavel
#   CI_DB_HOST      default 127.0.0.1
#   CI_DB_PORT      default 3306
#   CI_MYSQL_IMAGE  default mysql:8.4 (so para o cabecalho do summary)
#   REPORT_DIR      default ${RUNNER_TEMP:-$(mktemp -d)}/db-provisioning/<AAAAMMDDTHHMMSSZ>-<sha7>
#   ETAPAS          lista separada por virgula entre reachable,migrations,slots,seed,status (default todas)
#
# Etapas: reachable (scripts/tests/db-reachable.test.sh), migrations
# (scripts/ci/migrations-fresh-db-check.sh no banco corgly_ci), slots
# (src/test/integration/provisioning/generate-slots-twice.test.ts no banco corgly_ci_slots),
# seed (scripts/ci/seed-twice-check.sh no banco corgly_ci) e status
# (scripts/ci/migrate-status-record.sh ci). Sem migrations PASSOU, slots, seed e status ficam
# NAO_EXECUTADA. A etapa vazamento_de_senha roda sempre no fim.
#
# O estado das etapas fica em REPORT_DIR/etapas.tsv; rodar de novo com o mesmo REPORT_DIR
# substitui a linha de cada etapa rodada, e o summary.md mostra o estado consolidado.
# Exit: 0 todas as etapas desta execucao PASSOU; 1 alguma nao passou; 2 entrada invalida;
# 3 MySQL nao aceitou conexao em 120 s.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1
export NO_COLOR=1

if [ -z "${CI_DB_PASSWORD:-}" ]; then
  echo "ERRO: CI_DB_PASSWORD ausente"
  exit 2
fi
if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
  echo "::add-mask::$CI_DB_PASSWORD"
fi

CI_DB_HOST="${CI_DB_HOST:-127.0.0.1}"
CI_DB_PORT="${CI_DB_PORT:-3306}"
CI_MYSQL_IMAGE="${CI_MYSQL_IMAGE:-mysql:8.4}"
COMMIT="$(git rev-parse HEAD 2>/dev/null || echo desconhecido)"
if [ -z "${REPORT_DIR:-}" ]; then
  REPORT_DIR="${RUNNER_TEMP:-$(mktemp -d)}/db-provisioning/$(date -u +%Y%m%dT%H%M%SZ)-${COMMIT:0:7}"
fi
ETAPAS="${ETAPAS:-reachable,migrations,slots,seed,status}"

IFS=',' read -r -a PEDIDAS <<< "$ETAPAS"
if [ "${#PEDIDAS[@]}" -eq 0 ]; then
  echo "ERRO: ETAPAS vazia"
  exit 2
fi
for e in "${PEDIDAS[@]}"; do
  case "$e" in
    reachable|migrations|slots|seed|status) ;;
    *) echo "ERRO: etapa desconhecida em ETAPAS: $e"; exit 2 ;;
  esac
done
pedida() { local e; for e in "${PEDIDAS[@]}"; do [ "$e" = "$1" ] && return 0; done; return 1; }

mkdir -p "$REPORT_DIR" || { echo "ERRO: nao foi possivel criar REPORT_DIR"; exit 2; }
export REPORT_DIR CI_DB_HOST CI_DB_PORT

# URLs montadas em memoria, nunca impressas. A senha entra codificada para URL.
senha_url="$(P="$CI_DB_PASSWORD" node -e 'process.stdout.write(encodeURIComponent(process.env.P || ""))')"
if [ -z "$senha_url" ]; then
  echo "ERRO: falha ao codificar CI_DB_PASSWORD"
  exit 2
fi
base_url="mysql://root:${senha_url}@${CI_DB_HOST}:${CI_DB_PORT}"
DB_MAIN_URL="$base_url/corgly_ci"
DB_SHADOW_URL="$base_url/corgly_ci_shadow"
DB_SLOTS_URL="$base_url/corgly_ci_slots"
unset senha_url base_url

ESTADO="$REPORT_DIR/etapas.tsv"
touch "$ESTADO"
FALHOU=0

# Tira cor ANSI e troca qualquer mysql://... por mysql://*** antes de gravar em disco.
filtra() { sed -E -e 's/\x1b\[[0-9;]*[A-Za-z]//g' -e 's#mysql://[^[:space:]]*#mysql://***#g'; }

# roda <log> <comando...>: stdout+stderr filtrados em REPORT_DIR/<log>; devolve o rc do comando.
roda() {
  local log="$1"; shift
  "$@" 2>&1 | filtra > "$REPORT_DIR/$log"
  return "${PIPESTATUS[0]}"
}

# sql_main <sql>: executa SQL no banco corgly_ci pelo Prisma CLI (sem cliente mysql no runner).
sql_main() { printf '%s\n' "$1" | npx prisma db execute --stdin --url "$DB_MAIN_URL"; }

# registra <etapa> <resultado> <rc> <log>: substitui a linha da etapa em etapas.tsv.
registra() {
  awk -F'\t' -v e="$1" '$1 != e' "$ESTADO" > "$ESTADO.tmp"
  printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >> "$ESTADO.tmp"
  mv "$ESTADO.tmp" "$ESTADO"
  echo "etapa $1: $2 (rc=$3)"
  [ "$2" = PASSOU ] || FALHOU=1
}

migrations_ok() { awk -F'\t' '$1 == "migrations" && $2 == "PASSOU" {f = 1} END {exit f ? 0 : 1}' "$ESTADO"; }

escreve_summary() {
  local e
  {
    echo "# db-provisioning"
    echo
    echo "Gerado em $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "Commit $COMMIT"
    echo "Run ${GITHUB_RUN_ID:-local}"
    echo "Imagem $CI_MYSQL_IMAGE"
    echo
    echo "| etapa | resultado | rc | log |"
    echo "|---|---|---|---|"
    for e in mysql_pronto bancos_auxiliares reachable migrations slots seed status vazamento_de_senha; do
      awk -F'\t' -v e="$e" '$1 == e {printf "| %s | %s | %s | %s |\n", $1, $2, $3, $4}' "$ESTADO"
    done
    echo
    echo "## migrate status (ci)"
    echo
    echo "| ambiente | registrado_em | commit | banco@host | migrations | estado | rc |"
    echo "|---|---|---|---|---|---|---|"
    if [ -s "$REPORT_DIR/migrate-status-ci.linha" ]; then
      cat "$REPORT_DIR/migrate-status-ci.linha"
    else
      echo "(etapa status nao executada)"
    fi
  } > "$REPORT_DIR/summary.md"
}

finaliza() {
  local vazados f
  escreve_summary
  vazados="$(grep -rlF -f <(printf '%s\n' "$CI_DB_PASSWORD") -- "$REPORT_DIR" 2>/dev/null)"
  if [ -n "$vazados" ]; then
    while IFS= read -r f; do
      rm -f -- "$f"
      echo "vazamento_de_senha: arquivo removido: ${f#"$REPORT_DIR"/}"
    done <<< "$vazados"
    registra vazamento_de_senha FALHA 1 -
  else
    registra vazamento_de_senha PASSOU 0 -
  fi
  escreve_summary
  echo
  cat "$REPORT_DIR/summary.md"
}

# Etapa reachable: nao depende do MySQL (npx stubado pelo PATH).
if pedida reachable; then
  roda reachable.log bash scripts/tests/db-reachable.test.sh
  rc=$?
  if [ "$rc" -eq 0 ]; then registra reachable PASSOU 0 reachable.log; else registra reachable FALHA "$rc" reachable.log; fi
fi

precisa_mysql=0
for e in migrations slots seed status; do pedida "$e" && precisa_mysql=1; done

if [ "$precisa_mysql" -eq 1 ]; then
  : > "$REPORT_DIR/mysql-pronto.log"
  inicio=$SECONDS
  tentativas=0
  pronto=0
  while [ $((SECONDS - inicio)) -lt 120 ]; do
    tentativas=$((tentativas + 1))
    sql_main 'SELECT 1;' 2>&1 | filtra >> "$REPORT_DIR/mysql-pronto.log"
    if [ "${PIPESTATUS[0]}" -eq 0 ]; then pronto=1; break; fi
    sleep 3
  done
  echo "tentativas=$tentativas segundos=$((SECONDS - inicio))" >> "$REPORT_DIR/mysql-pronto.log"
  if [ "$pronto" -ne 1 ]; then
    registra mysql_pronto FALHA 3 mysql-pronto.log
    for e in migrations slots seed status; do
      if pedida "$e"; then registra "$e" NAO_EXECUTADA - -; fi
    done
    finaliza
    exit 3
  fi
  registra mysql_pronto PASSOU 0 mysql-pronto.log

  roda bancos-auxiliares.log sql_main 'CREATE DATABASE IF NOT EXISTS `corgly_ci_shadow`; CREATE DATABASE IF NOT EXISTS `corgly_ci_slots`;'
  rc=$?
  if [ "$rc" -eq 0 ]; then registra bancos_auxiliares PASSOU 0 bancos-auxiliares.log; else registra bancos_auxiliares FALHA "$rc" bancos-auxiliares.log; fi
fi

# Etapa migrations: banco corgly_ci vazio, deploy, status e os dois diffs.
if pedida migrations; then
  roda migrations-run.log env DATABASE_URL="$DB_MAIN_URL" SHADOW_DATABASE_URL="$DB_SHADOW_URL" bash scripts/ci/migrations-fresh-db-check.sh
  rc=$?
  if [ "$rc" -eq 0 ]; then registra migrations PASSOU 0 migrations.md; else registra migrations FALHA "$rc" migrations.md; fi
fi

# Etapa slots: banco proprio corgly_ci_slots, deploy e o teste de geracao dupla.
if pedida slots; then
  if ! migrations_ok; then
    registra slots NAO_EXECUTADA - -
  else
    roda slots-guard.log env DATABASE_URL="$DB_SLOTS_URL" npx prisma migrate status
    if ! grep -qF -- "Datasource \"db\": MySQL database \"corgly_ci_slots\" at \"$CI_DB_HOST:$CI_DB_PORT\"" "$REPORT_DIR/slots-guard.log"; then
      echo "ABORTADO: alvo inesperado"
      registra slots FALHA 4 slots-guard.log
    else
      roda slots-deploy.log env DATABASE_URL="$DB_SLOTS_URL" npx prisma migrate deploy
      rc=$?
      if [ "$rc" -ne 0 ]; then
        registra slots FALHA "$rc" slots-deploy.log
      else
        roda slots-twice.log env DATABASE_URL="$DB_SLOTS_URL" DATABASE_URL_TEST="$DB_SLOTS_URL" npx vitest run --config vitest.integration.config.ts src/test/integration/provisioning/generate-slots-twice.test.ts
        rc=$?
        if [ "$rc" -eq 0 ]; then
          registra slots PASSOU 0 slots-twice.log
        elif grep -qF 'INCONCLUSIVO:' "$REPORT_DIR/slots-twice.log"; then
          registra slots INCONCLUSIVO "$rc" slots-twice.log
        else
          registra slots FALHA "$rc" slots-twice.log
        fi
      fi
    fi
  fi
fi

# Etapa seed: npm run db:seed duas vezes no banco corgly_ci ja migrado.
if pedida seed; then
  if ! migrations_ok; then
    registra seed NAO_EXECUTADA - -
  else
    roda seed-run.log env DATABASE_URL="$DB_MAIN_URL" bash scripts/ci/seed-twice-check.sh
    rc=$?
    case "$rc" in
      0) registra seed PASSOU 0 seed.md ;;
      5) registra seed INCONCLUSIVO 5 seed.md ;;
      *) registra seed FALHA "$rc" seed.md ;;
    esac
  fi
fi

# Etapa status: linha de migrate status do ambiente ci.
if pedida status; then
  if ! migrations_ok; then
    registra status NAO_EXECUTADA - -
  else
    linha="$(env DATABASE_URL="$DB_MAIN_URL" bash scripts/ci/migrate-status-record.sh ci 2> "$REPORT_DIR/status-run.log")"
    rc=$?
    printf '%s\n' "$linha" | filtra > "$REPORT_DIR/migrate-status-ci.linha"
    if [ "$rc" -eq 0 ]; then registra status PASSOU 0 migrate-status-ci.log; else registra status FALHA "$rc" migrate-status-ci.log; fi
  fi
fi

finaliza
exit "$FALHOU"

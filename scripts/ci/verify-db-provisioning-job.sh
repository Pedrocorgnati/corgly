#!/usr/bin/env bash
# Verificador estatico do job de provisionamento de banco (GAP-01, loop 09-06, ST001).
# Roda na raiz do repo, imprime "OK <item>" ou "FALTA <item>" e sai 1 se houver falta.
# Uso: bash scripts/ci/verify-db-provisioning-job.sh
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

WF=.github/workflows/db-provisioning.yml
faltas=0

ok()    { echo "OK $*"; }
falta() { echo "FALTA $*"; faltas=$((faltas + 1)); }

# 1. Workflow existe
if [ -f "$WF" ]; then ok "$WF"; else falta "$WF"; fi

# 2. Gatilhos com master em push e pull_request
if [ -f "$WF" ]; then
  n_master="$(grep -cE '^[[:space:]]*branches:.*(\[|[[:space:],])master([],[:space:]]|$)' "$WF")"
else
  n_master=0
fi
if [ "${n_master:-0}" -ge 2 ]; then
  ok "workflow com master em 2+ linhas branches: ($n_master)"
else
  falta "workflow com master em 2+ linhas branches: (${n_master:-0})"
fi

# 3. Conteudo obrigatorio do workflow
for s in 'scripts/ci/db-provisioning-run.sh' 'mysql:8.4' '::add-mask::' 'TZ: UTC' \
         'GITHUB_STEP_SUMMARY' 'actions/upload-artifact@v4' 'if: always()'; do
  if [ -f "$WF" ] && grep -qF -- "$s" "$WF"; then
    ok "workflow contem $s"
  else
    falta "workflow contem $s"
  fi
done

# 4. Conteudo proibido no workflow (so avaliado com o workflow presente)
if [ -f "$WF" ]; then
  if grep -qF -- 'secrets.DATABASE_URL' "$WF"; then
    falta "workflow sem secrets.DATABASE_URL"
  else
    ok "workflow sem secrets.DATABASE_URL"
  fi
  if grep -qE 'MYSQL_ROOT_PASSWORD[=:][[:space:]]*"?[A-Za-z0-9]' "$WF"; then
    falta "workflow sem senha literal em MYSQL_ROOT_PASSWORD"
  else
    ok "workflow sem senha literal em MYSQL_ROOT_PASSWORD"
  fi
else
  falta "workflow sem secrets.DATABASE_URL (workflow ausente)"
  falta "workflow sem senha literal em MYSQL_ROOT_PASSWORD (workflow ausente)"
fi

# 5. Arquivos do job
for f in scripts/ci/db-provisioning-run.sh scripts/ci/migrations-fresh-db-check.sh \
         scripts/ci/seed-twice-check.sh scripts/ci/db-table-counts.ts \
         scripts/ci/migrate-status-record.sh scripts/tests/db-reachable.test.sh \
         src/test/integration/provisioning/generate-slots-twice.test.ts; do
  if [ -f "$f" ]; then ok "$f"; else falta "$f"; fi
done

# contem_em <arquivo> <rotulo> <padroes...>
contem_em() {
  local arq="$1" rotulo="$2"; shift 2
  local s
  for s in "$@"; do
    if [ -f "$arq" ] && grep -qF -- "$s" "$arq"; then
      ok "$rotulo contem $s"
    else
      falta "$rotulo contem $s"
    fi
  done
}

# 6. Migrations em banco vazio
contem_em scripts/ci/migrations-fresh-db-check.sh migrations-fresh-db-check.sh \
  'prisma migrate deploy' 'prisma migrate status' '--from-url' \
  '--from-migrations prisma/migrations' '--shadow-database-url' \
  '--to-schema-datamodel prisma/schema.prisma' '--exit-code'

# 7. Seed duplo
contem_em scripts/ci/seed-twice-check.sh seed-twice-check.sh 'db:seed' 'db-table-counts.ts'

# 8. Orquestrador referencia todas as etapas
contem_em scripts/ci/db-provisioning-run.sh db-provisioning-run.sh \
  'db-reachable.test.sh' 'migrations-fresh-db-check.sh' 'generate-slots-twice.test.ts' \
  'seed-twice-check.sh' 'migrate-status-record.sh'

echo "RESULTADO: $faltas falta(s)"
[ "$faltas" -eq 0 ] || exit 1
exit 0

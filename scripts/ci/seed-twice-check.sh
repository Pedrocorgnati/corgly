#!/usr/bin/env bash
# Seed rodado duas vezes com invariantes de contagem (GAP-01, loop 09-06, ST005).
# Chamado por scripts/ci/db-provisioning-run.sh, que exporta DATABASE_URL (banco corgly_ci ja
# migrado), REPORT_DIR, CI_DB_HOST e CI_DB_PORT. Roda com TZ=UTC.
# Grava em REPORT_DIR: seed.md, seed-rodada-1.log, seed-rodada-2.log, seed-counts-1.tsv,
# seed-counts-2.tsv, seed-counts.diff e seed-slots-distinct.tsv. Contagens por
# scripts/ci/db-table-counts.ts (COUNT(*) exato por tabela). Nunca grava URL de banco.
# Exit: 0 PASSOU; 1 FALHA; 2 entrada ausente; 4 alvo inesperado; 5 INCONCLUSIVO_VIRADA_DE_DIA.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1
export TZ=UTC NO_COLOR=1

if [ -z "${DATABASE_URL:-}" ] || [ -z "${REPORT_DIR:-}" ]; then
  echo "ERRO: DATABASE_URL e REPORT_DIR precisam estar exportadas" >&2
  exit 2
fi
HOST="${CI_DB_HOST:-127.0.0.1}"
PORT="${CI_DB_PORT:-3306}"
mkdir -p "$REPORT_DIR" || exit 2
MD="$REPORT_DIR/seed.md"
C1="$REPORT_DIR/seed-counts-1.tsv"
C2="$REPORT_DIR/seed-counts-2.tsv"

falhas_duras=0
linhas=()
dia_inicio="-"
dia_fim="-"
diferentes=""

roda() {
  local log="$1"; shift
  "$@" 2>&1 | sed -E -e 's/\x1b\[[0-9;]*[A-Za-z]//g' -e 's#mysql://[^[:space:]]*#mysql://***#g' > "$REPORT_DIR/$log"
  return "${PIPESTATUS[0]}"
}

# conta <saida.tsv> [flags...]: contagens do banco corgly_ci; stderr em <saida>.err (apagado se vazio).
conta() {
  local out="$1"; shift
  npx tsx scripts/ci/db-table-counts.ts --expect-db=corgly_ci "$@" > "$out" 2> "$out.err"
  local rc=$?
  [ -s "$out.err" ] || rm -f "$out.err"
  return "$rc"
}

# registra <verificacao> <valor> <resultado> [dura]
registra() {
  linhas+=("| $1 | $2 | $3 |")
  echo "seed $1: $2 -> $3"
  if [ "$3" != PASSOU ] && [ "${4:-}" = dura ]; then falhas_duras=$((falhas_duras + 1)); fi
}

escreve_md() {
  {
    echo "# seed rodado duas vezes"
    echo
    echo "Gerado em $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "Alvo esperado: banco corgly_ci em $HOST:$PORT"
    echo "Dia UTC no inicio: $dia_inicio; no fim: $dia_fim"
    echo
    echo "| verificacao | valor | resultado |"
    echo "|---|---|---|"
    printf '%s\n' "${linhas[@]}"
    echo
    echo "## tabelas com contagem diferente"
    echo
    if [ -n "$diferentes" ]; then
      echo "| tabela | rodada 1 | rodada 2 |"
      echo "|---|---|---|"
      printf '%s\n' "$diferentes"
    else
      echo "nenhuma"
    fi
    echo
    echo "$1"
  } > "$MD"
}

# 1. Guard de alvo pela linha Datasource (o Prisma CLI poderia cair num .env local).
roda seed-guard.log npx prisma migrate status
if ! grep -qF -- "Datasource \"db\": MySQL database \"corgly_ci\" at \"$HOST:$PORT\"" "$REPORT_DIR/seed-guard.log"; then
  registra guard_de_alvo "linha Datasource diferente de corgly_ci em $HOST:$PORT" FALHA dura
  echo "ABORTADO: alvo inesperado"
  escreve_md "Resultado: ABORTADO: alvo inesperado"
  exit 4
fi
registra guard_de_alvo "corgly_ci em $HOST:$PORT" PASSOU

dia_inicio="$(date -u +%F)"

# 2. Rodada 1 e 3. Rodada 2: seed seguido da contagem exata por tabela.
for n in 1 2; do
  roda "seed-rodada-$n.log" npm run db:seed
  rc=$?
  if [ "$rc" -eq 0 ]; then registra "rodada_${n}_db_seed" "rc=0" PASSOU; else registra "rodada_${n}_db_seed" "rc=$rc" FALHA dura; fi
  out="$REPORT_DIR/seed-counts-$n.tsv"
  conta "$out"
  rc=$?
  if [ "$rc" -eq 0 ] && [ -s "$out" ]; then
    registra "rodada_${n}_contagem" "$(wc -l < "$out" | tr -d ' ') tabelas" PASSOU
  elif [ "$rc" -eq 4 ]; then
    registra "rodada_${n}_contagem" "rc=4 banco inesperado" FALHA dura
    echo "ABORTADO: alvo inesperado"
    dia_fim="$(date -u +%F)"
    escreve_md "Resultado: ABORTADO: alvo inesperado"
    exit 4
  else
    registra "rodada_${n}_contagem" "rc=$rc" FALHA dura
  fi
  # A rodada 2 e as comparacoes dependem da rodada 1 inteira (seed e contagem).
  if [ "$n" -eq 1 ] && [ "$falhas_duras" -gt 0 ]; then
    for v in rodada_2_db_seed rodada_2_contagem contagens_iguais minimo_users minimo_availability_slots slots_total_igual_distintos; do
      registra "$v" - NAO_EXECUTADA
    done
    dia_fim="$(date -u +%F)"
    escreve_md "Resultado: FALHA (rodada 1; rodada 2 e comparacoes nao executadas)"
    exit 1
  fi
done

# 4. Contagens iguais entre as rodadas. diff: 0 iguais, 1 diferentes, 2 ou mais erro ao comparar.
diff -u "$C1" "$C2" > "$REPORT_DIR/seed-counts.diff"
rc_diff=$?
diferentes="$(awk -F'\t' 'NR == FNR {a[$1] = $2; next} {b[$1] = $2; if (!($1 in a)) a[$1] = "ausente"} END {for (t in a) {v = (t in b) ? b[t] : "ausente"; if (a[t] != v) printf "| %s | %s | %s |\n", t, a[t], v}}' "$C1" "$C2" | LC_ALL=C sort)"
falha_diff=0
case "$rc_diff" in
  0) registra contagens_iguais "diff vazio" PASSOU ;;
  1) registra contagens_iguais "diff rc=1, contagens diferentes" FALHA
     falha_diff=1 ;;
  *) registra contagens_iguais "diff rc=$rc_diff, erro ao comparar" FALHA dura ;;
esac

# 5. Minimos que provam que o seed rodou (rodada 1).
for t in users availability_slots; do
  v="$(awk -F'\t' -v t="$t" '$1 == t {print $2}' "$C1")"
  if [ -n "$v" ] && [ "$v" -ge 1 ] 2>/dev/null; then registra "minimo_$t" "$v" PASSOU; else registra "minimo_$t" "${v:-ausente}" FALHA dura; fi
done

# 6. Slots sem duplicata de startAt.
conta "$REPORT_DIR/seed-slots-distinct.tsv" --slots-distinct
rc=$?
IFS=$'\t' read -r total distintos < "$REPORT_DIR/seed-slots-distinct.tsv"
if [ "$rc" -eq 0 ] && [ -n "${total:-}" ] && [ "${total:-}" = "${distintos:-}" ]; then
  registra slots_total_igual_distintos "total=$total distintos=$distintos" PASSOU
else
  registra slots_total_igual_distintos "rc=$rc total=${total:-?} distintos=${distintos:-?}" FALHA dura
fi

# 7. Virada de dia UTC: o seed usa startOfDay(new Date()), entao dias diferentes criam slots diferentes.
dia_fim="$(date -u +%F)"

if [ "$falhas_duras" -gt 0 ]; then
  escreve_md "Resultado: FALHA ($falhas_duras verificacao(oes))"
  exit 1
fi
if [ "$dia_fim" != "$dia_inicio" ]; then
  escreve_md "Resultado: INCONCLUSIVO_VIRADA_DE_DIA"
  exit 5
fi
if [ "$falha_diff" -ne 0 ]; then
  escreve_md "Resultado: FALHA (contagens diferentes entre as rodadas)"
  exit 1
fi
escreve_md "Resultado: PASSOU"
exit 0

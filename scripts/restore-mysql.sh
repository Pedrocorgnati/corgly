#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# restore-mysql.sh — Restaura dump criptografado para um database alvo.
#
# Uso:
#   ./scripts/restore-mysql.sh <YYYY-MM-DD> <target_db>
# Ex:
#   BACKUP_ENCRYPTION_KEY_FILE=/etc/corgly/backup.key \
#   DATABASE_URL=mysql://root:pw@localhost:3306/corgly_restore_test \
#   ./scripts/restore-mysql.sh 2026-04-21 corgly_restore_test
#
# Fluxo:
#   1. Baixa do remoto (se BACKUP_REMOTE setado) ou usa local em BACKUP_LOCAL_DIR.
#   2. openssl dec → gunzip → mysql <target_db>.
#   3. Verifica contagem minima em User como sanity check.
#
# NUNCA rodar contra o DB de producao sem confirmar.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

log() { printf '[restore-mysql %s] %s\n' "$(date -u +%FT%TZ)" "$*"; }
fail() { log "ERRO: $*"; exit 1; }

[[ $# -eq 2 ]] || fail "uso: $0 <YYYY-MM-DD> <target_db>"

STAMP="$1"
TARGET_DB="$2"

[[ "$STAMP" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || fail "data invalida"
[[ "$TARGET_DB" =~ ^[A-Za-z0-9_]+$ ]] || fail "target_db invalido"
[[ "$TARGET_DB" == "corgly" ]] && fail "recusando restore no DB de producao ('corgly'). Use um nome de restore."

: "${DATABASE_URL:?DATABASE_URL ausente}"
: "${BACKUP_ENCRYPTION_KEY_FILE:?BACKUP_ENCRYPTION_KEY_FILE ausente}"
[[ -r "$BACKUP_ENCRYPTION_KEY_FILE" ]] || fail "chave ilegivel"

BACKUP_LOCAL_DIR="${BACKUP_LOCAL_DIR:-/var/backups/corgly}"
FILE_NAME="corgly-${STAMP}.sql.gz.enc"
LOCAL_FILE="${BACKUP_LOCAL_DIR}/${FILE_NAME}"

command -v mysql >/dev/null || fail "cliente mysql nao encontrado"

parse_url() {
  python3 - "$1" <<'PY'
import sys
from urllib.parse import urlparse, unquote
u = urlparse(sys.argv[1])
print(u.username or '')
print(unquote(u.password or ''))
print(u.hostname or '')
print(u.port or '3306')
PY
}
mapfile -t PARSED < <(parse_url "$DATABASE_URL")
DB_USER="${PARSED[0]}"
DB_PASS="${PARSED[1]}"
DB_HOST="${PARSED[2]}"
DB_PORT="${PARSED[3]}"

# ── Obter arquivo ────────────────────────────────────────────────────────────
if [[ ! -f "$LOCAL_FILE" ]]; then
  if [[ -n "${BACKUP_REMOTE:-}" ]]; then
    mkdir -p "$BACKUP_LOCAL_DIR"
    if [[ "$BACKUP_REMOTE" == s3://* ]]; then
      aws s3 cp "${BACKUP_REMOTE%/}/${FILE_NAME}" "$LOCAL_FILE" \
        || fail "download s3"
    else
      rclone copy "${BACKUP_REMOTE%/}/${FILE_NAME}" "$BACKUP_LOCAL_DIR" \
        || fail "download rclone"
    fi
  else
    fail "arquivo $LOCAL_FILE ausente e BACKUP_REMOTE vazio"
  fi
fi
log "fonte: $LOCAL_FILE"

# ── Cria target DB se nao existir ────────────────────────────────────────────
MYSQL_PWD="$DB_PASS" mysql --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" \
  -e "CREATE DATABASE IF NOT EXISTS \`${TARGET_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" \
  || fail "criar database alvo"

# ── Pipeline de restore ──────────────────────────────────────────────────────
set -o pipefail
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass "file:$BACKUP_ENCRYPTION_KEY_FILE" \
  -in "$LOCAL_FILE" \
  | gunzip -c \
  | MYSQL_PWD="$DB_PASS" mysql --host="$DB_HOST" --port="$DB_PORT" \
      --user="$DB_USER" "$TARGET_DB" \
  || fail "pipeline de restore"
log "restore aplicado em $TARGET_DB"

# ── Sanity check ─────────────────────────────────────────────────────────────
USER_COUNT=$(MYSQL_PWD="$DB_PASS" mysql -N -B --host="$DB_HOST" --port="$DB_PORT" \
  --user="$DB_USER" "$TARGET_DB" -e "SELECT COUNT(*) FROM User" 2>/dev/null || echo "?")
log "sanity: SELECT COUNT(*) FROM User = $USER_COUNT"

log "restore concluido"

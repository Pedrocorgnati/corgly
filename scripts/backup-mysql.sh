#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# backup-mysql.sh — Dump diario criptografado do MySQL do Corgly.
#
# Uso:
#   BACKUP_ENCRYPTION_KEY_FILE=/etc/corgly/backup.key ./scripts/backup-mysql.sh
#
# Env obrigatorio (lidos do .env da aplicacao quando rodado no servidor):
#   DATABASE_URL                mysql://user:pass@host:port/db?...
#   BACKUP_ENCRYPTION_KEY_FILE  caminho para arquivo com a passphrase (chmod 600)
#
# Env opcional:
#   BACKUP_LOCAL_DIR            default: /var/backups/corgly
#   BACKUP_REMOTE               rclone target, ex: r2:corgly-backups
#                               (ou s3://corgly-backups — cai em aws-cli)
#   BACKUP_RETENTION_LOCAL_DAYS default: 7
#   BACKUP_RETENTION_REMOTE_DAYS default: 30
#   HEALTHCHECK_URL             dead-man's-switch (ex: hc-ping.com/uuid).
#                               Pingado em sucesso e em failure (com body).
#   SENTRY_WEBHOOK_URL          opcional — payload de alerta em caso de falha.
#
# Convencoes:
#   Exit code != 0 aciona alerta. STDERR e preservado.
#   Nenhum segredo e logado.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

LOG_PREFIX="[backup-mysql $(date -u +%FT%TZ)]"
log() { printf '%s %s\n' "$LOG_PREFIX" "$*"; }
fail() {
  local msg="$1"
  log "ERRO: $msg"
  if [[ -n "${HEALTHCHECK_URL:-}" ]]; then
    curl -fsS --retry 3 --data "$msg" "${HEALTHCHECK_URL}/fail" || true
  fi
  if [[ -n "${SENTRY_WEBHOOK_URL:-}" ]]; then
    curl -fsS --retry 3 -H 'Content-Type: application/json' \
      -d "{\"msg\":\"backup-mysql failed\",\"detail\":\"$msg\",\"ts\":\"$(date -u +%FT%TZ)\"}" \
      "$SENTRY_WEBHOOK_URL" || true
  fi
  exit 1
}

command -v mysqldump >/dev/null || fail "mysqldump nao encontrado"
command -v gzip >/dev/null || fail "gzip nao encontrado"
command -v openssl >/dev/null || fail "openssl nao encontrado"

: "${DATABASE_URL:?DATABASE_URL ausente}"
: "${BACKUP_ENCRYPTION_KEY_FILE:?BACKUP_ENCRYPTION_KEY_FILE ausente}"
[[ -r "$BACKUP_ENCRYPTION_KEY_FILE" ]] || fail "chave $BACKUP_ENCRYPTION_KEY_FILE ilegivel"

BACKUP_LOCAL_DIR="${BACKUP_LOCAL_DIR:-/var/backups/corgly}"
BACKUP_RETENTION_LOCAL_DAYS="${BACKUP_RETENTION_LOCAL_DAYS:-7}"
BACKUP_RETENTION_REMOTE_DAYS="${BACKUP_RETENTION_REMOTE_DAYS:-30}"

mkdir -p "$BACKUP_LOCAL_DIR"

# ── Parsear DATABASE_URL (mysql://user:pass@host:port/db?...) ────────────────
parse_url() {
  local url="$1"
  python3 - "$url" <<'PY'
import sys
from urllib.parse import urlparse, unquote
u = urlparse(sys.argv[1])
print(u.username or '')
print(unquote(u.password or ''))
print(u.hostname or '')
print(u.port or '3306')
print((u.path or '').lstrip('/'))
PY
}

mapfile -t PARSED < <(parse_url "$DATABASE_URL") || fail "parse DATABASE_URL"
DB_USER="${PARSED[0]}"
DB_PASS="${PARSED[1]}"
DB_HOST="${PARSED[2]}"
DB_PORT="${PARSED[3]}"
DB_NAME="${PARSED[4]}"

[[ -n "$DB_NAME" ]] || fail "DATABASE_URL sem nome de database"

STAMP="$(date -u +%F)"
OUT_FILE="$BACKUP_LOCAL_DIR/corgly-${STAMP}.sql.gz.enc"
log "alvo: $OUT_FILE (db=$DB_NAME host=$DB_HOST)"

# ── Pipe: mysqldump → gzip → openssl enc (aes-256-cbc + PBKDF2) ──────────────
set -o pipefail
MYSQL_PWD="$DB_PASS" mysqldump \
  --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" \
  --single-transaction --quick --routines --triggers --events \
  --set-gtid-purged=OFF --no-tablespaces "$DB_NAME" \
  | gzip -9 \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
      -pass "file:$BACKUP_ENCRYPTION_KEY_FILE" \
      -out "$OUT_FILE" \
  || fail "pipeline mysqldump/gzip/openssl"

SIZE_BYTES=$(stat -c '%s' "$OUT_FILE" 2>/dev/null || stat -f '%z' "$OUT_FILE")
[[ "$SIZE_BYTES" -gt 1024 ]] || fail "backup suspeitamente pequeno ($SIZE_BYTES bytes)"
log "dump local ok ($SIZE_BYTES bytes)"

# ── Upload remoto ────────────────────────────────────────────────────────────
if [[ -n "${BACKUP_REMOTE:-}" ]]; then
  if [[ "$BACKUP_REMOTE" == s3://* ]]; then
    command -v aws >/dev/null || fail "aws cli nao encontrado"
    aws s3 cp "$OUT_FILE" "${BACKUP_REMOTE%/}/$(basename "$OUT_FILE")" \
      --only-show-errors || fail "upload aws s3"
  else
    command -v rclone >/dev/null || fail "rclone nao encontrado"
    rclone copy "$OUT_FILE" "$BACKUP_REMOTE" --retries 3 \
      || fail "upload rclone"
  fi
  log "upload remoto ok ($BACKUP_REMOTE)"
else
  log "BACKUP_REMOTE vazio — somente backup local (nao recomendado em prod)"
fi

# ── Retencao local ───────────────────────────────────────────────────────────
find "$BACKUP_LOCAL_DIR" -type f -name 'corgly-*.sql.gz.enc' \
  -mtime +"$BACKUP_RETENTION_LOCAL_DAYS" -delete || true
log "purga local (>${BACKUP_RETENTION_LOCAL_DAYS}d) concluida"

# ── Retencao remota ──────────────────────────────────────────────────────────
if [[ -n "${BACKUP_REMOTE:-}" ]]; then
  if [[ "$BACKUP_REMOTE" == s3://* ]]; then
    CUTOFF=$(date -u -d "-${BACKUP_RETENTION_REMOTE_DAYS} days" +%F)
    aws s3 ls "${BACKUP_REMOTE%/}/" | awk '{print $4}' | while read -r key; do
      [[ -z "$key" ]] && continue
      stamp=$(echo "$key" | sed -n 's/.*corgly-\([0-9-]\{10\}\)\..*/\1/p')
      [[ -z "$stamp" ]] && continue
      if [[ "$stamp" < "$CUTOFF" ]]; then
        aws s3 rm "${BACKUP_REMOTE%/}/$key" --only-show-errors || true
      fi
    done
  else
    rclone delete --min-age "${BACKUP_RETENTION_REMOTE_DAYS}d" "$BACKUP_REMOTE" || true
  fi
  log "purga remota (>${BACKUP_RETENTION_REMOTE_DAYS}d) concluida"
fi

# ── Dead-man's-switch OK ─────────────────────────────────────────────────────
if [[ -n "${HEALTHCHECK_URL:-}" ]]; then
  curl -fsS --retry 3 --data "ok size=$SIZE_BYTES file=$(basename "$OUT_FILE")" \
    "$HEALTHCHECK_URL" || true
fi

log "backup concluido com sucesso"

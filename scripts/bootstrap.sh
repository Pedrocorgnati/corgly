#!/usr/bin/env bash
# bootstrap.sh — Setup completo do ambiente local (Corgly)
# Gerado por /dev-bootstrap-create (SystemForge)
# Uso: ./scripts/bootstrap.sh [--reset | --health]
set -euo pipefail

# === Cores ===
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[bootstrap]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err()  { echo -e "${RED}[erro]${NC} $*" >&2; }

# === Pre-requisitos ===
check_prereqs() {
  local missing=()

  for cmd in git node docker; do
    command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
  done

  if ! command -v docker-compose >/dev/null 2>&1 && ! docker compose version >/dev/null 2>&1; then
    missing+=("docker compose")
  fi

  if [ ${#missing[@]} -gt 0 ]; then
    err "Faltando pre-requisitos: ${missing[*]}"
    err "Instale os itens acima e tente novamente."
    exit 1
  fi
  ok "Pre-requisitos verificados"
}

# === .env ===
ensure_env() {
  if [ -f .env ]; then
    ok ".env ja existe"
    return
  fi
  if [ -f .env.example ]; then
    cp .env.example .env
    ok ".env criado a partir de .env.example"
    warn "Revise .env e preencha valores sensiveis antes de continuar"
  else
    warn ".env nao encontrado — crie manualmente ou baseie-se em .env.example"
    exit 1
  fi
}

# === Dependencias npm ===
install_deps() {
  log "Instalando dependencias..."
  npm install --legacy-peer-deps
  ok "Dependencias instaladas"
}

# === Docker services ===
start_services() {
  log "Subindo servicos Docker..."
  docker compose up -d

  log "Aguardando servicos ficarem saudaveis..."
  local max_wait=120
  local waited=0
  local db_ready=false

  while [ $waited -lt $max_wait ]; do
    if docker compose exec -T db mysql -u root -p"${MYSQL_ROOT_PASSWORD:-root}" -e "SELECT 1;" >/dev/null 2>&1; then
      db_ready=true
      break
    fi
    sleep 2
    waited=$((waited + 2))
    echo -ne "\r  Aguardando DB... ${waited}s"
  done

  echo ""
  if [ "$db_ready" = true ]; then
    ok "Servicos Docker rodando"
  else
    warn "Timeout aguardando DB (${max_wait}s)"
    warn "Verifique com: docker compose ps"
    warn "Logs: docker compose logs db"
  fi
}

stop_services() {
  log "Parando servicos Docker..."
  docker compose down
  ok "Servicos parados"
}

# === Migrations (Prisma) ===
run_migrations() {
  log "Executando migrations (Prisma)..."
  npx prisma migrate deploy
  ok "Migrations aplicadas"
}

# === Seeds (Prisma) ===
run_seeds() {
  log "Executando seeds..."
  npm run db:seed
  ok "Seeds aplicados"
}

# === Health check (leve) ===
check_health() {
  log "Verificando saude do ambiente..."
  local errors=0

  # .env
  if [ -f .env ]; then
    ok ".env presente"
  else
    warn ".env ausente"
    errors=$((errors + 1))
  fi

  # Containers
  if docker compose ps 2>/dev/null | grep -q "Up"; then
    ok "Containers rodando"
  else
    warn "Containers nao estao rodando"
    errors=$((errors + 1))
  fi

  # DB connectivity
  if docker compose exec -T db mysql -u root -p"${MYSQL_ROOT_PASSWORD:-root}" -e "SELECT 1;" >/dev/null 2>&1; then
    ok "Database acessivel"
  else
    warn "Database nao acessivel"
    errors=$((errors + 1))
  fi

  # Prisma schema
  if [ -f prisma/schema.prisma ]; then
    ok "Schema Prisma encontrado"
  else
    warn "Schema Prisma nao encontrado"
    errors=$((errors + 1))
  fi

  if [ $errors -eq 0 ]; then
    ok "Ambiente saudavel ✓"
  else
    warn "$errors problema(s) encontrado(s) — verifique acima"
  fi
}

# === Resumo ===
show_summary() {
  echo ""
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  ✓ BOOTSTRAP COMPLETO (Corgly)${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "  Para iniciar o dev server:"
  echo "    npm run dev           (ou: make dev)"
  echo ""
  echo "  Servicos Docker:"
  echo "    docker compose up     (ou: npm run docker:dev)"
  echo "    docker compose down   (ou: npm run docker:down)"
  echo ""
  echo "  Testes:"
  echo "    npm test              (ou: make test)"
  echo "    npm run test:e2e"
  echo "    npm run test:integration"
  echo ""
  echo "  Database:"
  echo "    npm run db:seed       (aplicar seeds)"
  echo "    npm run db:reset      (reset completo)"
  echo ""
  echo "  Resetar ambiente:"
  echo "    ./scripts/bootstrap.sh --reset"
  echo ""
  echo "  Health check:"
  echo "    ./scripts/bootstrap.sh --health"
  echo ""
}

# === Reset ===
do_reset() {
  warn "Resetando ambiente (isso pode levar alguns momentos)..."
  echo ""

  # Docker
  docker compose down -v 2>/dev/null || true

  # Node modules
  rm -rf node_modules .next dist build 2>/dev/null || true

  # .env
  rm -f .env 2>/dev/null || true

  ok "Ambiente limpo"
  echo ""

  do_setup
}

# === Setup principal ===
do_setup() {
  log "Iniciando bootstrap de Corgly..."
  echo ""

  check_prereqs
  ensure_env
  install_deps
  start_services
  run_migrations
  run_seeds
  check_health
  show_summary
}

# === Entrypoint ===
cd "$(dirname "$0")/.."

case "${1:-}" in
  --reset)
    do_reset
    ;;
  --health)
    check_health
    ;;
  *)
    do_setup
    ;;
esac

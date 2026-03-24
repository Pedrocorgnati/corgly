# Makefile — Corgly Development
# Gerado por /dev-bootstrap-create (SystemForge)
# Uso: make [target]

.PHONY: help setup reset dev build start lint test test:ui test:coverage test:integration test:all test:e2e docker:up docker:down docker:clean seed

help:
	@echo "Corgly Makefile — Available targets:"
	@echo ""
	@echo "  SETUP:"
	@echo "    make setup              Bootstrap completo do ambiente local"
	@echo "    make reset              Reset + reinstal (limpeza profunda)"
	@echo ""
	@echo "  DEVELOPMENT:"
	@echo "    make dev                Inicia dev server (Next.js em http://localhost:3000)"
	@echo "    make build              Build para producao"
	@echo "    make start              Inicia producao build"
	@echo ""
	@echo "  CODE QUALITY:"
	@echo "    make lint               Roda ESLint"
	@echo ""
	@echo "  TESTING:"
	@echo "    make test               Vitest (unit/integration, watch)"
	@echo "    make test:ui            Vitest com UI"
	@echo "    make test:coverage      Vitest com coverage"
	@echo "    make test:integration   Vitest (somente testes de integracao)"
	@echo "    make test:all           Todos os testes (unit + integration)"
	@echo "    make test:e2e           Playwright E2E tests"
	@echo ""
	@echo "  DATABASE:"
	@echo "    make seed               Executa seeds (Prisma)"
	@echo ""
	@echo "  DOCKER:"
	@echo "    make docker:up          docker compose up -d"
	@echo "    make docker:down        docker compose down"
	@echo "    make docker:clean       docker compose down -v (remove volumes)"
	@echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SETUP
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

setup:
	@./scripts/bootstrap.sh

reset:
	@./scripts/bootstrap.sh --reset

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DEVELOPMENT
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

dev:
	@npm run dev

build:
	@npm run build

start:
	@npm start

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CODE QUALITY
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

lint:
	@npm run lint

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# TESTING
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test:
	@npm test

test:ui:
	@npm run test:ui

test:coverage:
	@npm run test:coverage

test:integration:
	@npm run test:integration

test:all:
	@npm run test:all

test:e2e:
	@npm run test:e2e

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DATABASE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

seed:
	@npm run db:seed

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DOCKER
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

docker:up:
	@npm run docker:dev

docker:down:
	@npm run docker:down

docker:clean:
	@npm run docker:clean

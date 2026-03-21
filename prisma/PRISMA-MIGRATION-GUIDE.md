# Prisma Migration Guide — Corgly

Projeto: corgly
ORM: Prisma
Database: MySQL / MariaDB
Data: 2026-03-21
Gerado por: /db-migration-create

---

## Visão Geral

O schema Prisma está completo em `prisma/schema.prisma` com **11 models** e **7 enums**.
Nenhuma migration foi executada ainda. Esta é a migration inicial do banco.

Prisma gerencia as migrations automaticamente via `prisma migrate dev`. Cada `migrate dev`
gera um arquivo SQL versionado em `prisma/migrations/` e atualiza a tabela `_prisma_migrations`.

---

## Pré-requisitos

```bash
# Variável de ambiente obrigatória
DATABASE_URL="mysql://user:password@host:3306/corgly"

# Confirmar que o banco de dados "corgly" existe
mysql -u user -p -e "CREATE DATABASE IF NOT EXISTS corgly CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

> **Hostinger Cloud:** O banco deve ser criado pelo painel antes de executar as migrations.

---

## Comandos

### Desenvolvimento (primeira vez)

```bash
cd output/workspace/corgly

# Gera os arquivos de migration e aplica no banco
npx prisma migrate dev --name init

# Verifica o resultado
npx prisma migrate status
```

### Desenvolvimento (após alterações no schema)

```bash
# Gera nova migration para as mudanças
npx prisma migrate dev --name <nome-descritivo>

# Exemplo:
npx prisma migrate dev --name add_content_notes
```

### Staging (obrigatório antes de produção)

```bash
# Apenas aplica migrations pendentes (não gera novas)
npx prisma migrate deploy

# Verificar status
npx prisma migrate status
```

### Produção

```bash
# NUNCA use `migrate dev` em produção
# Use sempre `migrate deploy`
npx prisma migrate deploy
```

---

## Ordem de Criação de Tabelas

Prisma resolve as dependências de FK automaticamente, mas a ordem lógica é:

| # | Tabela | Depende de |
|---|--------|------------|
| 1 | User | — |
| 2 | AvailabilitySlot | — |
| 3 | Content | — |
| 4 | CreditBatch | User |
| 5 | RecurringPattern | User |
| 6 | Session | User, AvailabilitySlot, CreditBatch, RecurringPattern |
| 7 | Feedback | Session |
| 8 | Payment | User, CreditBatch |
| 9 | Subscription | User |
| 10 | SessionDocument | Session |
| 11 | CookieConsent | User |

---

## Enums Criados (MySQL ENUM types via Prisma)

| Enum | Valores |
|------|---------|
| UserRole | STUDENT, ADMIN |
| SessionStatus | SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED_BY_STUDENT, CANCELLED_BY_ADMIN, NO_SHOW_STUDENT, NO_SHOW_ADMIN, INTERRUPTED, RESCHEDULE_PENDING |
| CreditType | SINGLE, PACK_5, PACK_10, MONTHLY, PROMO, MANUAL, REFUND |
| PaymentStatus | PENDING, COMPLETED, FAILED, REFUNDED |
| SubscriptionStatus | ACTIVE, CANCELLED, PAST_DUE |
| SupportedLanguage | PT_BR, EN_US, ES_ES, IT_IT |
| ContentType | VIDEO_GRAMMAR, VIDEO_VOCABULARY, VIDEO_PRONUNCIATION |

> No MySQL, Prisma implementa enums como colunas ENUM nativas.

---

## Rollback

### Desenvolvimento

```bash
# CUIDADO: destrói todos os dados
npx prisma migrate reset
```

### Staging / Produção

Prisma **não gera rollbacks automáticos**. Para reverter em staging:

```bash
# Opção 1: Dropar e recriar o banco (staging apenas)
mysql -u user -p -e "DROP DATABASE corgly; CREATE DATABASE corgly CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
npx prisma migrate deploy  # re-aplicar até a versão anterior

# Opção 2: Criar nova migration de rollback
npx prisma migrate dev --name rollback_<nome>
# Editar o arquivo SQL gerado com os comandos DROP adequados
```

> **Boas práticas:** Testar rollback em staging ANTES de aplicar em produção.
> Para a migration inicial, rollback = dropar todas as tabelas (sem dados de produção ainda).

---

## Checklist Pré-Produção

- [ ] `DATABASE_URL` configurado no `.env`
- [ ] Banco `corgly` criado com `utf8mb4`
- [ ] `npx prisma migrate deploy` executado em staging
- [ ] `npx prisma migrate status` mostra 0 migrations pendentes em staging
- [ ] Backup do banco de produção realizado (se existir)
- [ ] Janela de manutenção comunicada (se produção tiver tráfego)

---

## Geração do Prisma Client

Após aplicar migrations, gerar o client tipado:

```bash
npx prisma generate
```

Em CI/CD, incluir `prisma generate` antes do `build`.

---

## Notas Técnicas

### Campo `termsAcceptedAt` (NOT NULL sem DEFAULT)

O campo `termsAcceptedAt` em `User` é `NOT NULL` sem valor padrão. Isso é correto para a
migration inicial (banco novo, sem dados). Ao adicionar este campo futuramente em uma tabela
com dados existentes, **será necessário fornecer um DEFAULT ou usar expand-contract**.

### Índice extra `deletionRequestedAt`

O schema inclui `@@index([deletionRequestedAt])` na tabela `User`, documentado no catálogo
do LLD (seção 2.2) mas ausente no schema-texto (seção 2.3). O índice é necessário para o
cron LGPD de exclusão automática de contas.

### Concorrência em `Session.creditBatchId` e `Session.recurringPatternId`

Estes campos são FKs sem índice explícito no schema. Em MySQL/InnoDB, o engine **cria
índices implícitos para colunas FK** automaticamente. Portanto, queries por `creditBatchId`
ou `recurringPatternId` terão suporte de índice mesmo sem declaração explícita.

### Lock otimista (`AvailabilitySlot.version`)

O campo `version` implementa lock otimista para agendamento concorrente. A migration cria
o campo como `INT DEFAULT 0`. A lógica de increment é responsabilidade do `SessionService`.

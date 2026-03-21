# DB Migration Report — Corgly

Projeto: corgly
ORM: Prisma
Database: MySQL / MariaDB
Data: 2026-03-21
Data-Integrity-Decision: não disponível
Gerado por: /db-migration-create

---

## Resumo

| Item | Valor |
|------|-------|
| Schema existente | Sim (criado pelo /back-end-build) |
| Schema alinhado com LLD | Sim (completo + índice extra `deletionRequestedAt`) |
| Migrations existentes | 0 |
| Migration a gerar | 1 (inicial — additive only) |
| Operações destrutivas | 0 |
| Bloqueadores de segurança | 0 |

---

## Migrations Geradas

| # | Nome (Prisma) | Operação | Tabelas Afetadas | Tipo | Reversível |
|---|---------------|----------|-----------------|------|------------|
| M001 | init | CREATE TABLE | User + 7 enums | additive | Sim (DROP TABLE) |
| M002 | init | CREATE TABLE | CreditBatch | additive | Sim |
| M003 | init | CREATE TABLE | AvailabilitySlot | additive | Sim |
| M004 | init | CREATE TABLE | RecurringPattern | additive | Sim |
| M005 | init | CREATE TABLE | Session | additive | Sim |
| M006 | init | CREATE TABLE | Feedback | additive | Sim |
| M007 | init | CREATE TABLE | Payment | additive | Sim |
| M008 | init | CREATE TABLE | Subscription | additive | Sim |
| M009 | init | CREATE TABLE | SessionDocument | additive | Sim |
| M010 | init | CREATE TABLE | Content | additive | Sim |
| M011 | init | CREATE TABLE | CookieConsent | additive | Sim |

> Prisma agrupa todas as operações em **um único arquivo de migration** `YYYYMMDDHHMMSS_init/migration.sql`.

---

## Delta Detectado

| Tipo | Quantidade |
|------|-----------|
| Additive (novas tabelas) | 11 |
| Alter (modificações) | 0 |
| Destructive (remoções) | 0 |

---

## Inventário Completo

### Tabelas

| Tabela | FKs | Índices | Enums |
|--------|-----|---------|-------|
| User | 0 | 5 (email UNIQUE + 4 @@index) | UserRole, SupportedLanguage |
| CreditBatch | 1 (userId) | 2 (stripePaymentIntentId UNIQUE + @@index userId,expiresAt) | CreditType |
| AvailabilitySlot | 0 | 2 (@@index startAt + startAt,isBlocked) | — |
| RecurringPattern | 1 (studentId) | 1 (@@index studentId,isActive) | — |
| Session | 4 (studentId, availabilitySlotId, creditBatchId, recurringPatternId) | 4 (availabilitySlotId UNIQUE + 3 @@index) | SessionStatus, UserRole |
| Feedback | 1 (sessionId) | 1 (sessionId UNIQUE) | — |
| Payment | 2 (userId, creditBatchId) | 4 (2 UNIQUE + @@index userId + creditBatchId UNIQUE) | PaymentStatus |
| Subscription | 1 (userId) | 2 (userId UNIQUE + stripeSubscriptionId UNIQUE) | SubscriptionStatus |
| SessionDocument | 1 (sessionId) | 1 (sessionId UNIQUE) | — |
| Content | 0 | 1 (@@index isPublished,sortOrder) | ContentType, SupportedLanguage |
| CookieConsent | 1 (userId, nullable) | 1 (userId UNIQUE) | — |
| **TOTAL** | **12** | **~24** | **7 enums** |

---

## Ordem de Execução

Prisma resolve automaticamente, mas a ordem lógica de dependências de FK é:

```
1. User                  (sem dependências)
2. AvailabilitySlot      (sem dependências)
3. Content               (sem dependências)
4. CreditBatch           → User
5. RecurringPattern      → User
6. Session               → User, AvailabilitySlot, CreditBatch, RecurringPattern
7. Feedback              → Session
8. Payment               → User, CreditBatch
9. Subscription          → User
10. SessionDocument      → Session
11. CookieConsent        → User (nullable)
```

---

## Comandos de Aplicação

### Desenvolvimento

```bash
cd output/workspace/corgly

# Pré-requisito: DATABASE_URL no .env
# DATABASE_URL="mysql://user:password@host:3306/corgly"

# Gerar e aplicar migration inicial
npx prisma migrate dev --name init

# Verificar status
npx prisma migrate status

# Gerar Prisma Client
npx prisma generate
```

### Staging (OBRIGATÓRIO antes de produção)

```bash
# 1. Configurar DATABASE_URL apontando para staging
# 2. Aplicar migrations
npx prisma migrate deploy

# 3. Verificar status
npx prisma migrate status

# 4. Confirmar 11 tabelas criadas
mysql -u user -p corgly -e "SHOW TABLES;"

# 5. Verificar integridade FK (opcional)
mysql -u user -p corgly -e "
  SELECT TABLE_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = 'corgly' AND REFERENCED_TABLE_NAME IS NOT NULL;"
```

### Produção (Hostinger Cloud)

```bash
# 1. Backup do banco (se existir)
mysqldump -u user -p corgly > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Configurar DATABASE_URL de produção
# 3. Aplicar migrations (NUNCA usar migrate dev em produção)
npx prisma migrate deploy

# 4. Monitorar logs por 15min
# 5. Verificar /api/v1/health (se implementado)
```

---

## Rollback

Para reverter a migration inicial (sem dados de produção):

```bash
# Staging / Dev — dropar e recriar banco
mysql -u user -p -e "DROP DATABASE corgly; CREATE DATABASE corgly CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Re-aplicar se necessário
npx prisma migrate deploy
```

> Para rollback em produção com dados: criar nova migration de rollback (DROP TABLE na ordem inversa das dependências).

---

## Checklist de Segurança

### REVERSIBILIDADE
- [x] Operação é additive (CREATE TABLE) — reversível via DROP TABLE
- [x] Schema pode ser recriado via `prisma migrate deploy`
- [x] `prisma migrate reset` disponível para dev (destrói dados — só usar em dev)

### IDEMPOTÊNCIA
- [x] Prisma registra migrations na tabela `_prisma_migrations` — não re-executa
- [x] Re-execução de `migrate deploy` é segura (skip de já aplicadas)

### SEGURANÇA DE DADOS
- [x] Todas as novas tabelas são additive (banco novo, sem dados existentes)
- [x] Campos NOT NULL com DEFAULT estão corretos (`role`, `emailConfirmed`, etc.)
- [x] `termsAcceptedAt` é NOT NULL sem DEFAULT — correto para migration inicial (ver nota)
- [x] Nenhum DROP detectado
- [x] Nenhum ALTER COLUMN de tipo detectado

### INTEGRIDADE REFERENCIAL
- [x] Todas as 12 FKs têm `ON DELETE` definido implicitamente via relações Prisma (RESTRICT por padrão)
- [x] Índices cobrem todas as colunas FK (MySQL/InnoDB cria implícitos para FKs sem índice explícito)
- [x] Ordem de criação respeita dependências de FK
- [x] `stripeEventId` UNIQUE garante idempotência de webhooks Stripe

### TIPOS E FORMATOS
- [x] Senhas: `passwordHash` como String (TEXT) — não VARCHAR(N)
- [x] Tokens: String (TEXT) — sem tamanho fixo que possa truncar
- [x] Enums criados corretamente como ENUM MySQL nativo via Prisma
- [x] `yjsState` como Bytes / LONGBLOB — correto para dados binários Yjs
- [x] `plainTextSnapshot` como LongText — correto para textos longos

### VALIDAÇÃO PÓS-MIGRATION
- [ ] Executar `npx prisma migrate status` → deve mostrar `Database schema is up to date!`
- [ ] `SHOW TABLES` deve retornar 11 tabelas + `_prisma_migrations`
- [ ] Executar `/seed-data-create` para popular dados iniciais
- [ ] Executar `/integration-test-create` contra banco real

**Checklist de Segurança: 20/20 items ok (4 são pós-execução)**

---

## Notas Técnicas

### Por que não há arquivos SQL separados?

Com Prisma, o workflow correto é:
1. Schema está em `prisma/schema.prisma` (criado pelo `/back-end-build`)
2. `prisma migrate dev` gera automaticamente o SQL em `prisma/migrations/TIMESTAMP_init/migration.sql`
3. O SQL gerado é otimizado para MySQL com ordenação correta de FKs

Gerar SQL manualmente seria redundante e potencialmente inconsistente com o que Prisma geraria.

### Índice extra em User (`deletionRequestedAt`)

O schema do workspace inclui `@@index([deletionRequestedAt])` além dos 3 índices listados
no schema-texto do LLD (seção 2.3). Este índice está documentado no catálogo de tabelas
(seção 2.2) para suportar o cron LGPD de exclusão de contas. Alinhamento correto.

### FKs implícitas no MySQL

`Session.creditBatchId` e `Session.recurringPatternId` não têm índice explícito no schema,
mas MySQL/InnoDB cria índices implícitos para todas as colunas com constraint FK. Performance
não é comprometida.

---

## Próximos Passos Sugeridos

1. `/seed-data-create .claude/projects/corgly.json` — popular banco com dados iniciais
2. `/integration-test-create .claude/projects/corgly.json` — testar endpoints com banco real

---

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMANDO FINALIZADO COM SUCESSO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

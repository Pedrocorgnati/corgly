# BACKUP-RUNBOOK — MySQL Corgly

**Projeto:** corgly
**Hosting:** hostinger:cloud
**DB:** MySQL (via Prisma)
**RTO (Recovery Time Objective):** 30 min
**RPO (Recovery Point Objective):** 24h (backup diario as 03:00 UTC)
**Retencao:** 7 dias local + 30 dias remoto

---

## 1. Visao geral

Pipeline de backup end-to-end:

```
mysqldump --single-transaction
  | gzip -9
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -pass file:$KEY
  > corgly-YYYY-MM-DD.sql.gz.enc
  -> rclone copy (ou aws s3 cp) -> remote bucket
```

Scripts:
- `scripts/backup-mysql.sh` — dump diario
- `scripts/restore-mysql.sh` — restore para DB alvo (nunca producao)

Alertas:
- Dead-man's-switch: `HEALTHCHECK_URL` (ex: healthchecks.io) — alerta se nenhum ping em 26h
- Falha imediata: `SENTRY_WEBHOOK_URL` recebe JSON com detalhe do erro

---

## 2. Pre-requisitos no servidor

Pacotes:
- `mysql-client` (`mysqldump`, `mysql`)
- `openssl`, `gzip`, `curl`, `python3`
- `rclone` **OU** `awscli` (conforme target)

Segredo:
- `BACKUP_ENCRYPTION_KEY_FILE` — arquivo com passphrase, `chmod 600`, `chown root:root`.
  Gerar uma vez: `openssl rand -base64 48 > /etc/corgly/backup.key && chmod 600 /etc/corgly/backup.key`
  **Guardar copia offline** no cofre do owner — sem a chave, os backups sao inuteis.

Variaveis de ambiente (ler do `.env` da aplicacao no host):
| Var | Obrigatoria | Descricao |
|-----|-------------|-----------|
| `DATABASE_URL` | sim | `mysql://user:pass@host:3306/corgly?...` |
| `BACKUP_ENCRYPTION_KEY_FILE` | sim | Caminho da chave de cifragem |
| `BACKUP_LOCAL_DIR` | nao | Default `/var/backups/corgly` |
| `BACKUP_REMOTE` | sim em prod | `r2:corgly-backups` (rclone) ou `s3://corgly-backups` |
| `BACKUP_RETENTION_LOCAL_DAYS` | nao | Default 7 |
| `BACKUP_RETENTION_REMOTE_DAYS` | nao | Default 30 |
| `HEALTHCHECK_URL` | recomendado | URL healthchecks.io (sem trailing slash) |
| `SENTRY_WEBHOOK_URL` | recomendado | Webhook do projeto Sentry para alertas |

---

## 3. Agendamento (cron)

Duas opcoes equivalentes — escolher conforme a stack do host.

### 3.1 Cron do sistema (`/etc/cron.d/corgly-backup`)

```cron
# /etc/cron.d/corgly-backup
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 3 * * * corgly . /home/corgly/app/.env && /home/corgly/app/scripts/backup-mysql.sh >> /var/log/corgly-backup.log 2>&1
```

### 3.2 PM2 cron_restart (alternativa, quando app vive no PM2)

```js
// ecosystem.config.js — entry dedicada ao backup
{
  name: 'corgly-backup',
  script: './scripts/backup-mysql.sh',
  cron_restart: '0 3 * * *',
  autorestart: false,
  out_file: '/var/log/corgly-backup.log',
  error_file: '/var/log/corgly-backup.err',
}
```

Validar:
```bash
crontab -u corgly -l | grep backup-mysql
# ou
pm2 jlist | jq '.[] | select(.name=="corgly-backup")'
```

---

## 4. Primeiro backup (go-live)

1. Confirmar secrets setados no `.env` do host (ver tabela acima)
2. Criar chave de cifragem e cofre offline
3. Criar bucket remoto (S3/R2) + policy de lifecycle 30d
4. Provisionar endpoint healthchecks.io e setar `HEALTHCHECK_URL`
5. Rodar dry-run manual:
   ```bash
   sudo -u corgly bash -lc 'set -a; . ~/app/.env; set +a; \
     BACKUP_ENCRYPTION_KEY_FILE=/etc/corgly/backup.key \
     ~/app/scripts/backup-mysql.sh'
   ```
6. Verificar:
   - `ls -la /var/backups/corgly/` — arquivo do dia presente
   - `rclone ls r2:corgly-backups/` (ou `aws s3 ls s3://corgly-backups/`) — upload ok
   - Log sem `ERRO:`
   - Ping recebido em healthchecks.io

---

## 5. Disaster recovery — restore passo a passo

**Janela alvo:** < 30 minutos do incidente a um DB funcional.

### 5.1 Restore para DB de teste (trimestral + drill de incidente)

```bash
# 1. Provisionar DB vazio
mysql -u root -p -e "CREATE DATABASE corgly_restore_test"

# 2. Rodar restore da data alvo
BACKUP_ENCRYPTION_KEY_FILE=/etc/corgly/backup.key \
DATABASE_URL="mysql://root:***@localhost:3306/corgly_restore_test" \
BACKUP_REMOTE=r2:corgly-backups \
./scripts/restore-mysql.sh 2026-04-21 corgly_restore_test

# 3. Sanity
mysql -u root -p corgly_restore_test -e "
  SELECT COUNT(*) users FROM User;
  SELECT COUNT(*) sessions FROM Session;
  SELECT MAX(createdAt) last FROM Payment;"
```

### 5.2 Restore real em producao (INCIDENTE)

1. **Colocar app em manutencao** (`pm2 stop corgly-web` + pagina de manutencao)
2. Renomear DB atual: `RENAME DATABASE corgly TO corgly_broken_YYYYMMDD` (ou dump + drop)
3. Criar `corgly` vazio
4. Rodar `restore-mysql.sh YYYY-MM-DD corgly_restore_tmp` — **o script recusa restaurar diretamente em `corgly`** (guardrail intencional)
5. Validar `corgly_restore_tmp` (sanity queries acima)
6. Promover: `RENAME DATABASE corgly_restore_tmp TO corgly` (ou `mysqldump corgly_restore_tmp | mysql corgly`)
7. Rodar migrations pendentes: `npx prisma migrate deploy`
8. Subir app: `pm2 start corgly-web`
9. Verificacao smoke (login, checkout teste, lista de sessoes)
10. Postmortem em `docs/ops/incidents/` com RCA

---

## 6. Teste trimestral (checklist)

Executar em ambiente de staging — registrar resultado em `docs/ops/backup-drills.md`.

- [ ] `restore-mysql.sh` aplica dump mais recente sem erro
- [ ] `SELECT COUNT(*) FROM User` > 0 e bate com producao (+- 5%)
- [ ] Tempo total < 30min (RTO respeitado)
- [ ] Chave de cifragem offline ainda descriptografa
- [ ] Healthchecks.io registrou ping dos ultimos 30 dias sem gap
- [ ] Bucket remoto tem exatamente `BACKUP_RETENTION_REMOTE_DAYS` arquivos (+/- 1)

---

## 7. Troubleshooting

| Sintoma | Causa provavel | Acao |
|---------|----------------|------|
| `mysqldump nao encontrado` | pacote `mysql-client` ausente | `apt install mysql-client` |
| `chave ilegivel` | permissao do key file | `chmod 600 /etc/corgly/backup.key` + `chown root:root` |
| `backup suspeitamente pequeno` | dump parcial / DB vazio | checar `DATABASE_URL` + conectividade manual |
| `upload s3/rclone` falha | credenciais expiradas | rotacionar token do bucket |
| Healthchecks alert 26h | cron nao disparou | `grep CRON /var/log/syslog`; verificar timezone do host |
| `restore` trava em FK | ordem de inserts | backup ja vem com `SET FOREIGN_KEY_CHECKS=0` via mysqldump — confirmar flag no arquivo |

---

## 8. Rotacao da chave de cifragem

A rotacao invalida backups antigos. Fazer em janela planejada:

1. Forcar backup com chave nova: `BACKUP_ENCRYPTION_KEY_FILE=/etc/corgly/backup.key.new ./scripts/backup-mysql.sh`
2. Validar restore em staging com a nova chave
3. Atualizar cofre offline + substituir arquivo no host
4. Manter chave antiga arquivada enquanto houver backups dela (30 dias)

---

## 9. Contacts

- **DBA / Ops primario:** owner do projeto corgly
- **On-call:** ver `PENDING-ACTIONS.md` (provisionamento)
- **Escalacao incidente:** Sentry -> alerta owner

---

## 10. Referencias

- `scripts/backup-mysql.sh`
- `scripts/restore-mysql.sh`
- `.env.example` (variaveis BACKUP_*)
- `prisma/schema.prisma` (modelo de dados)

# PENDING-ACTIONS — corgly

Acoes manuais pendentes do owner. Atualizado por `/skill:resolve-gaps` em 2026-04-21.

---

## Infra / Credenciais (herdadas de intake-review TASK-2, TASK-3, TASK-4)

- [ ] Provisionar **Sentry DSN** (prod) + `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` em `.env` prod
- [ ] Provisionar **bucket de backup** (R2/S3) + lifecycle 30d + credenciais rclone/aws
- [ ] Gerar e arquivar offline a chave `BACKUP_ENCRYPTION_KEY_FILE`
- [ ] Provisionar endpoint **healthchecks.io** + `HEALTHCHECK_URL`
- [ ] Configurar `SENTRY_WEBHOOK_URL` para alertas de backup
- [ ] Instalar cron `/etc/cron.d/corgly-backup` (ou PM2 cron_restart) no host Hostinger
- [ ] Criar **Stripe Price IDs** prod para 16 combinacoes (SINGLE/PACK_5/PACK_10/PROMO) x (BRL/USD/EUR/USDC) + popular `STRIPE_PRICE_*` no `.env` prod
- [ ] Conferir taxas FX em `pricing/config.ts` com owner antes de go-live
- [ ] Validar device test manualmente em Chrome + Safari + Firefox (TASK-12 — sem E2E automatico)

---

## PWA Icons (gap CL-250 — G3 do resolve-gaps 2026-04-21)

O `public/manifest.json` foi criado referenciando 4 icones que precisam ser gerados (assets graficos):

- [ ] `public/icons/icon-192.png` (192x192, purpose any)
- [ ] `public/icons/icon-512.png` (512x512, purpose any)
- [ ] `public/icons/icon-maskable-192.png` (192x192, purpose maskable — safe zone 10%)
- [ ] `public/icons/icon-maskable-512.png` (512x512, purpose maskable — safe zone 10%)

Sugestao: usar o logo existente `public/apple-touch-icon.png` como base e gerar via https://realfavicongenerator.net/ ou `pwa-asset-generator`. Enquanto os arquivos nao existirem, o browser ignora silenciosamente as entradas (nao quebra o manifest — apenas fica sem icone PWA).

---

## Follow-up code (gap residual — G4 do resolve-gaps 2026-04-21)

- [ ] Executar `output/wbs/corgly/modules/module-6-calendario-agendamento/TASK-REFORGE-001.md` para conectar `ConfirmModal` em cancelar-aula, deletar-conta, revogar-sessao (cobre CL-033, CL-078).

---

## Residuais do intake-review (7 tasks nao executadas)

- [ ] TASK-9 (Cupons de desconto) — P1, gap CL-037
- [ ] TASK-10 (Feedback campos adicionais) — P1, gaps CL-116, CL-118, CL-119
- [ ] TASK-11 (SEO multi-idioma hreflang + sitemap) — P2, gaps CL-010, CL-203, CL-249
- [ ] TASK-13 (Extrato + recibos PDF) — P2, gaps CL-261, CL-264
- [ ] TASK-14 (Analytics funil) — P2, gaps CL-168, CL-195..CL-197, CL-199, CL-202, CL-206
- [ ] TASK-17 (LGPD complementar + WCAG) — P3, gaps CL-184, CL-185, CL-295
- [ ] TASK-18 (Engajamento streak/badges) — P3, gaps CL-141, CL-151, CL-161, CL-166, CL-170..CL-173, CL-198

# Hardcodes Summary — Corgly

**Data:** 2026-03-22 | **Config:** `.claude/projects/corgly.json`

## Resultado Final

| Métrica | Valor |
|---------|-------|
| Hardcodes encontrados | 110 |
| Hardcodes corrigidos | 110 |
| Arquivos de constantes modificados | 3 |
| Arquivos consumidores modificados | 48 |
| Cobertura | 100% |

## Constantes Modificadas/Estendidas

| Arquivo | O que foi feito |
|---------|-----------------|
| `src/lib/constants/enums.ts` | Adicionado `SubscriptionStatus.TRIAL` |
| `src/lib/constants/routes.ts` | Reescrito: ROUTES expandido + API de 8 → 35 endpoints |
| `src/lib/constants/index.ts` | Adicionados `PAGINATION`, `UI_TIMING`, `STORAGE_KEYS` |

## Distribuição de Hardcodes

```
Status/Roles (enums)     ████████████████████  47
Caminhos de API          █████████████         31
Rotas de navegação       ████████              18
Magic numbers (paginação)████                   9
Magic numbers (timing)   █                      3
Storage keys             █                      2
                                              ───
                                              110
```

## Próximos passos sugeridos

- `/nextjs:typescript` — Verificar se os tipos dos enums propagam corretamente
- `/nextjs:configuration` — Auditar variáveis de ambiente (fora do escopo deste comando)
- `/build-verify` — Confirmar que o TypeScript compila sem erros após todas as substituições
